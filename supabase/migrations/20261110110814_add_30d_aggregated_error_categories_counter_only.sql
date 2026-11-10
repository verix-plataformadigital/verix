-- 30-day aggregated technical error categories.
-- Persist only date + bounded category + occurrence count. Never store a
-- matrícula, query ID, installation/session ID, raw error, request body or message.

BEGIN;

CREATE TABLE IF NOT EXISTS public.verix_daily_error_types (
  stat_date date NOT NULL,
  error_type text NOT NULL CHECK (error_type IN (
    'http_null','http_400','security_auth','upstream_timeout',
    'upstream_network','invalid_json','parse_error','rate_limited',
    'network_error','timeout','unknown','other',
    'http_401','http_403','http_404','http_429','http_5xx',
    'graphql_error','service_unavailable','empty_response'
  )),
  occurrences bigint NOT NULL DEFAULT 0 CHECK (occurrences >= 0),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (stat_date, error_type)
);

ALTER TABLE public.verix_daily_metrics_state
  ADD COLUMN IF NOT EXISTS error_types_since timestamptz NOT NULL DEFAULT clock_timestamp();

ALTER TABLE public.verix_daily_error_types ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verix_daily_error_types FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(
  p_events jsonb,
  p_installations jsonb,
  p_sessions jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_event record;
  v_events_accepted bigint := 0;
  v_metrics_updated bigint := 0;
  v_error_type text;
BEGIN
  IF jsonb_typeof(p_events) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_installations) IS DISTINCT FROM 'array'
     OR jsonb_typeof(p_sessions) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'telemetry ingestion expects JSON arrays'
      USING ERRCODE = '22023';
  END IF;

  FOR v_event IN
    SELECT
      NULLIF(BTRIM(item->>'query_id'), '') AS query_id,
      NULLIF(BTRIM(item->>'event'), '') AS event,
      NULLIF(BTRIM(item->>'occurred_at'), '')::timestamptz AS occurred_at,
      NULLIF(BTRIM(item->>'error_type'), '') AS error_type
    FROM jsonb_array_elements(p_events) AS item
    ORDER BY NULLIF(BTRIM(item->>'query_id'), ''), NULLIF(BTRIM(item->>'occurred_at'), '')::timestamptz
  LOOP
    IF v_event.event IS DISTINCT FROM 'heartbeat' THEN
      v_events_accepted := v_events_accepted + 1;
    END IF;

    IF v_event.event IN (
      'vehicle_lookup',
      'vehicle_insurance_yes',
      'vehicle_insurance_no',
      'vehicle_insurance_error'
    ) THEN
      IF public.verix_apply_lifetime_metric_event(
        v_event.query_id,
        v_event.event,
        v_event.occurred_at
      ) THEN
        v_metrics_updated := v_metrics_updated + 1;

        -- Increment the category aggregate only after the deduplication
        -- function confirms a new, final error result for this query.
        IF v_event.event = 'vehicle_insurance_error' THEN
          v_error_type := CASE
            WHEN v_event.error_type IN (
              'http_null','http_400','security_auth','upstream_timeout',
              'upstream_network','invalid_json','parse_error','rate_limited',
              'network_error','timeout','unknown','http_401','http_403',
              'http_404','http_429','http_5xx','graphql_error',
              'service_unavailable','empty_response'
            ) THEN v_event.error_type
            ELSE 'other'
          END;

          INSERT INTO public.verix_daily_error_types(
            stat_date, error_type, occurrences, updated_at
          )
          VALUES (
            (v_event.occurred_at AT TIME ZONE 'Europe/Lisbon')::date,
            v_error_type,
            1,
            clock_timestamp()
          )
          ON CONFLICT (stat_date, error_type) DO UPDATE
            SET occurrences = public.verix_daily_error_types.occurrences + 1,
                updated_at = clock_timestamp();
        END IF;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'events_inserted', v_events_accepted,
    'metrics_updated', v_metrics_updated,
    'sessions_detached', 0
  );
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
  SELECT collecting_since, error_types_since
  FROM public.verix_daily_metrics_state
  WHERE singleton = true
),
bounds AS (
  SELECT
    (clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date AS today,
    collecting_since,
    (collecting_since AT TIME ZONE 'Europe/Lisbon')::date AS first_day,
    error_types_since,
    (error_types_since AT TIME ZONE 'Europe/Lisbon')::date AS first_error_day
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
),
error_type_totals AS (
  SELECT e.error_type, sum(e.occurrences)::bigint AS occurrences
  FROM public.verix_daily_error_types e
  CROSS JOIN bounds b
  WHERE e.stat_date >= greatest(b.today - 29, b.first_error_day)
    AND e.stat_date <= b.today
  GROUP BY e.error_type
)
SELECT jsonb_build_object(
  'window_days', 30,
  'collecting_since', (SELECT collecting_since FROM bounds),
  'error_types_since', (SELECT error_types_since FROM bounds),
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
  ),
  'error_types', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'error_type', e.error_type,
      'occurrences', e.occurrences
    ) ORDER BY e.occurrences DESC, e.error_type)
    FROM error_type_totals e
  ), '[]'::jsonb),
  'classified_error_total', coalesce((SELECT sum(occurrences) FROM error_type_totals), 0)
);
$function$;

-- The category aggregates use the same rolling 30-day retention.
DELETE FROM public.verix_daily_error_types
WHERE stat_date < ((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - 29);

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'verix_daily_error_types_30d_retention'
  LIMIT 1;

  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;

  PERFORM cron.schedule(
    'verix_daily_error_types_30d_retention',
    '20 4 * * *',
    $cmd$DELETE FROM public.verix_daily_error_types
         WHERE stat_date < ((clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - 29);$cmd$
  );
END
$$;

COMMIT;
