-- VÉRIX: 30-day aggregate operational metrics.
-- Persists one row per Lisbon calendar day; never persists plates, raw events or query IDs.

CREATE TABLE IF NOT EXISTS public.verix_daily_metrics (
  stat_date date PRIMARY KEY,
  consultations bigint NOT NULL DEFAULT 0 CHECK (consultations >= 0),
  no_record_results bigint NOT NULL DEFAULT 0 CHECK (no_record_results >= 0),
  errors bigint NOT NULL DEFAULT 0 CHECK (errors >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS public.verix_daily_metrics_state (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  collecting_since timestamptz NOT NULL DEFAULT clock_timestamp(),
  retention_days smallint NOT NULL DEFAULT 30 CHECK (retention_days = 30)
);

INSERT INTO public.verix_daily_metrics_state(singleton, collecting_since, retention_days)
VALUES (true, clock_timestamp(), 30)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.verix_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verix_daily_metrics_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.verix_daily_metrics FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.verix_daily_metrics_state FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.verix_daily_metrics TO service_role;
GRANT SELECT ON TABLE public.verix_daily_metrics_state TO service_role;

-- Idempotency tokens are one-way hashes and are retained for 30 days only.
UPDATE public.verix_lifetime_query_state
SET expires_at = LEAST(expires_at, updated_at + interval '30 days');
DELETE FROM public.verix_lifetime_query_state
WHERE expires_at <= clock_timestamp();

UPDATE public.verix_lifetime_counters
SET dedupe_from = GREATEST(dedupe_from, clock_timestamp() - interval '30 days')
WHERE singleton = true;

CREATE OR REPLACE FUNCTION public.verix_apply_lifetime_metric_event(
  p_query_id text,
  p_event text,
  p_occurred_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_hash text;
  v_dedupe_from timestamptz;
  v_old_search boolean := false;
  v_new_search boolean := false;
  v_old_final text;
  v_new_final text;
  v_incoming_final text;
  v_expires_at timestamptz;
  v_old_counted_no_record integer := 0;
  v_new_counted_no_record integer := 0;
  v_delta_search integer := 0;
  v_delta_no_record integer := 0;
  v_delta_error integer := 0;
  v_metrics_started_at timestamptz;
  v_stat_date date;
  v_min_stat_date date;
BEGIN
  IF p_event NOT IN (
    'vehicle_lookup',
    'vehicle_insurance_yes',
    'vehicle_insurance_no',
    'vehicle_insurance_error'
  ) OR NULLIF(BTRIM(p_query_id), '') IS NULL OR p_occurred_at IS NULL THEN
    RETURN false;
  END IF;

  SELECT c.dedupe_from
    INTO v_dedupe_from
  FROM public.verix_lifetime_counters c
  WHERE c.singleton = true;

  IF v_dedupe_from IS NULL
     OR p_occurred_at < v_dedupe_from
     OR p_occurred_at > clock_timestamp() + interval '5 minutes' THEN
    RETURN false;
  END IF;

  SELECT s.collecting_since
    INTO v_metrics_started_at
  FROM public.verix_daily_metrics_state s
  WHERE s.singleton = true;

  v_stat_date := (p_occurred_at AT TIME ZONE 'Europe/Lisbon')::date;
  v_min_stat_date := (clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - 29;

  v_hash := md5(LOWER(BTRIM(p_query_id)));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_hash, 2718281828));

  INSERT INTO public.verix_lifetime_query_state (
    query_hash, has_lookup, final_state, expires_at, updated_at
  )
  VALUES (
    v_hash, false, NULL, clock_timestamp() + interval '30 days', clock_timestamp()
  )
  ON CONFLICT (query_hash) DO NOTHING;

  SELECT s.has_lookup, s.final_state, s.expires_at
    INTO v_old_search, v_old_final, v_expires_at
  FROM public.verix_lifetime_query_state s
  WHERE s.query_hash = v_hash
  FOR UPDATE;

  IF v_expires_at <= clock_timestamp() THEN
    v_old_search := false;
    v_old_final := NULL;
  END IF;

  v_new_search := v_old_search OR (p_event = 'vehicle_lookup');
  v_new_final := v_old_final;

  v_incoming_final := CASE p_event
    WHEN 'vehicle_insurance_yes' THEN 'yes'
    WHEN 'vehicle_insurance_no' THEN 'no_record'
    WHEN 'vehicle_insurance_error' THEN 'error'
    ELSE NULL
  END;

  IF v_incoming_final IS NOT NULL THEN
    IF v_new_final IS NULL THEN
      v_new_final := v_incoming_final;
    ELSIF v_new_final <> v_incoming_final THEN
      v_new_final := 'conflict';
    END IF;
  END IF;

  IF v_new_search AND NOT v_old_search THEN
    v_delta_search := 1;
  END IF;

  IF v_old_search AND v_old_final = 'no_record' THEN
    v_old_counted_no_record := 1;
  END IF;
  IF v_new_search AND v_new_final = 'no_record' THEN
    v_new_counted_no_record := 1;
  END IF;
  v_delta_no_record := v_new_counted_no_record - v_old_counted_no_record;

  IF v_new_search
     AND v_new_final = 'error'
     AND (NOT v_old_search OR v_old_final IS NULL) THEN
    v_delta_error := 1;
  END IF;

  UPDATE public.verix_lifetime_query_state
  SET
    has_lookup = v_new_search,
    final_state = v_new_final,
    expires_at = clock_timestamp() + interval '30 days',
    updated_at = clock_timestamp()
  WHERE query_hash = v_hash;

  IF v_delta_search <> 0 OR v_delta_no_record <> 0 THEN
    UPDATE public.verix_lifetime_counters
    SET
      total_searches = GREATEST(0, total_searches + v_delta_search),
      total_no_record_results = GREATEST(0, total_no_record_results + v_delta_no_record),
      updated_at = clock_timestamp()
    WHERE singleton = true;
  END IF;

  IF p_occurred_at >= v_metrics_started_at
     AND v_stat_date >= v_min_stat_date
     AND (v_delta_search > 0 OR v_delta_no_record > 0 OR v_delta_error > 0) THEN
    INSERT INTO public.verix_daily_metrics (
      stat_date, consultations, no_record_results, errors, updated_at
    )
    VALUES (
      v_stat_date,
      GREATEST(v_delta_search, 0),
      GREATEST(v_delta_no_record, 0),
      GREATEST(v_delta_error, 0),
      clock_timestamp()
    )
    ON CONFLICT (stat_date) DO UPDATE
      SET consultations = public.verix_daily_metrics.consultations + EXCLUDED.consultations,
          no_record_results = public.verix_daily_metrics.no_record_results + EXCLUDED.no_record_results,
          errors = public.verix_daily_metrics.errors + EXCLUDED.errors,
          updated_at = clock_timestamp();
  END IF;

  RETURN v_delta_search <> 0
      OR v_delta_no_record <> 0
      OR v_delta_error <> 0;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verix_daily_metrics_30d_read()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
WITH state AS (
  SELECT collecting_since
  FROM public.verix_daily_metrics_state
  WHERE singleton = true
),
bounds AS (
  SELECT
    (clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date AS today,
    collecting_since,
    (collecting_since AT TIME ZONE 'Europe/Lisbon')::date AS first_day
  FROM state
),
calendar AS (
  SELECT (b.today - offs)::date AS stat_date, b.collecting_since, b.first_day
  FROM bounds b
  CROSS JOIN generate_series(29, 0, -1) AS offs
),
daily AS (
  SELECT
    c.stat_date,
    (c.stat_date >= c.first_day) AS available,
    CASE WHEN c.stat_date >= c.first_day THEN coalesce(m.consultations, 0) ELSE NULL END AS consultations,
    CASE WHEN c.stat_date >= c.first_day THEN coalesce(m.no_record_results, 0) ELSE NULL END AS no_record_results,
    CASE WHEN c.stat_date >= c.first_day THEN coalesce(m.errors, 0) ELSE NULL END AS errors
  FROM calendar c
  LEFT JOIN public.verix_daily_metrics m ON m.stat_date = c.stat_date
)
SELECT jsonb_build_object(
  'window_days', 30,
  'collecting_since', (SELECT collecting_since FROM bounds),
  'generated_at', clock_timestamp(),
  'days', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'date', d.stat_date,
      'available', d.available,
      'consultations', d.consultations,
      'no_record_results', d.no_record_results,
      'errors', d.errors
    ) ORDER BY d.stat_date)
    FROM daily d
  ), '[]'::jsonb),
  'totals', jsonb_build_object(
    'consultations', coalesce((SELECT sum(consultations) FROM daily WHERE available), 0),
    'no_record_results', coalesce((SELECT sum(no_record_results) FROM daily WHERE available), 0),
    'errors', coalesce((SELECT sum(errors) FROM daily WHERE available), 0)
  )
);
$function$;

REVOKE ALL ON FUNCTION public.verix_daily_metrics_30d_read() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_daily_metrics_30d_read() TO service_role;
GRANT EXECUTE ON FUNCTION public.verix_apply_lifetime_metric_event(text, text, timestamptz) TO service_role;

SELECT cron.schedule(
  'verix_daily_metrics_30d_retention',
  '17 4 * * *',
  $job$DELETE FROM public.verix_daily_metrics
       WHERE stat_date < ((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - 29);$job$
);
