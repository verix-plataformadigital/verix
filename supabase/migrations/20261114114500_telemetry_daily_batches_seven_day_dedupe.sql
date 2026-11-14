-- Query hashes are retained only as long as queued clients may retry.
-- The Edge collector accepts vehicle_lookup events for at most seven days.
CREATE OR REPLACE FUNCTION public.verix_apply_lifetime_metric_event(p_query_id text, p_event text, p_occurred_at timestamp with time zone, p_error_type text)
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
  v_old_final_at timestamptz;
  v_new_final_at timestamptz;
  v_old_error_type text;
  v_new_error_type text;
  v_old_error_type_counted boolean := true;
  v_new_error_type_counted boolean := true;
  v_old_counted_no_record integer := 0;
  v_new_counted_no_record integer := 0;
  v_delta_search integer := 0;
  v_delta_no_record integer := 0;
  v_delta_error integer := 0;
  v_metrics_started_at timestamptz;
  v_error_types_started_at timestamptz;
  v_stat_date date;
  v_final_stat_date date;
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

  SELECT s.collecting_since, s.error_types_since
    INTO v_metrics_started_at, v_error_types_started_at
  FROM public.verix_daily_metrics_state s
  WHERE s.singleton = true;

  v_stat_date := (p_occurred_at AT TIME ZONE 'Europe/Lisbon')::date;
  v_min_stat_date := (clock_timestamp() AT TIME ZONE 'Europe/Lisbon')::date - 29;

  v_hash := md5(LOWER(BTRIM(p_query_id)));

  -- Serialize state transitions for a query ID and make retries idempotent.
  INSERT INTO public.verix_lifetime_query_state (
    query_hash,
    has_lookup,
    final_state,
    expires_at,
    updated_at,
    final_state_at,
    final_error_type,
    error_type_counted
  )
  VALUES (
    v_hash,
    false,
    NULL,
    clock_timestamp() + interval '7 days',
    clock_timestamp(),
    NULL,
    NULL,
    false
  )
  ON CONFLICT (query_hash) DO NOTHING;

  SELECT
    s.has_lookup,
    s.final_state,
    s.expires_at,
    s.final_state_at,
    s.final_error_type,
    s.error_type_counted
  INTO
    v_old_search,
    v_old_final,
    v_expires_at,
    v_old_final_at,
    v_old_error_type,
    v_old_error_type_counted
  FROM public.verix_lifetime_query_state s
  WHERE s.query_hash = v_hash
  FOR UPDATE;

  IF v_expires_at <= clock_timestamp() THEN
    v_old_search := false;
    v_old_final := NULL;
    v_old_final_at := NULL;
    v_old_error_type := NULL;
    v_old_error_type_counted := false;
  END IF;

  v_new_search := v_old_search OR (p_event = 'vehicle_lookup');
  v_new_final := v_old_final;
  v_new_final_at := v_old_final_at;
  v_new_error_type := v_old_error_type;
  v_new_error_type_counted := v_old_error_type_counted;

  v_incoming_final := CASE p_event
    WHEN 'vehicle_insurance_yes' THEN 'yes'
    WHEN 'vehicle_insurance_no' THEN 'no_record'
    WHEN 'vehicle_insurance_error' THEN 'error'
    ELSE NULL
  END;

  IF v_incoming_final IS NOT NULL THEN
    IF v_new_final IS NULL THEN
      v_new_final := v_incoming_final;
      v_new_final_at := p_occurred_at;
    ELSIF v_new_final <> v_incoming_final THEN
      v_new_final := 'conflict';
    END IF;
  END IF;

  -- Preserve only an allow-listed error category and its timestamp in the
  -- short-lived hashed dedupe state. This covers error-before-lookup delivery.
  IF p_event = 'vehicle_insurance_error'
     AND v_new_final = 'error'
     AND v_new_error_type IS NULL
     AND NOT v_new_error_type_counted
     AND p_occurred_at >= v_error_types_started_at THEN
    v_new_error_type := CASE
      WHEN p_error_type IN (
        'http_null','http_400','security_auth','upstream_timeout',
        'upstream_network','invalid_json','parse_error','rate_limited',
        'network_error','timeout','unknown','http_401','http_403',
        'http_404','http_429','http_5xx','graphql_error',
        'service_unavailable','empty_response'
      ) THEN p_error_type
      ELSE 'other'
    END;
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

  -- Count a consultation error once even when its final event arrived before
  -- the vehicle_lookup marker. The category follows that same final outcome.
  IF v_new_search
     AND v_new_final = 'error'
     AND (NOT v_old_search OR v_old_final IS NULL) THEN
    v_delta_error := 1;
  END IF;

  v_final_stat_date := CASE
    WHEN coalesce(v_new_final_at, p_occurred_at) IS NOT NULL
      THEN (coalesce(v_new_final_at, p_occurred_at) AT TIME ZONE 'Europe/Lisbon')::date
    ELSE NULL
  END;

  -- An old state row defaults to counted=true so that the migration never
  -- fabricates categories for errors whose details have already been deleted.
  IF v_delta_error > 0 AND NOT v_new_error_type_counted THEN
    IF v_new_error_type IS NOT NULL
       AND v_new_final_at IS NOT NULL
       AND v_new_final_at >= v_error_types_started_at
       AND v_final_stat_date >= v_min_stat_date THEN
      INSERT INTO public.verix_daily_error_types (
        stat_date, error_type, occurrences, updated_at
      )
      VALUES (
        v_final_stat_date,
        v_new_error_type,
        1,
        clock_timestamp()
      )
      ON CONFLICT (stat_date, error_type) DO UPDATE
        SET occurrences = public.verix_daily_error_types.occurrences + 1,
            updated_at = clock_timestamp();
    END IF;
    v_new_error_type_counted := true;
  END IF;

  UPDATE public.verix_lifetime_query_state
  SET
    has_lookup = v_new_search,
    lookup_at = CASE
      WHEN v_new_search AND NOT v_old_search THEN p_occurred_at
      ELSE lookup_at
    END,
    final_state = v_new_final,
    expires_at = clock_timestamp() + interval '7 days',
    updated_at = clock_timestamp(),
    final_state_at = v_new_final_at,
    final_error_type = v_new_error_type,
    error_type_counted = v_new_error_type_counted
  WHERE query_hash = v_hash;

  IF v_delta_search <> 0 OR v_delta_no_record <> 0 THEN
    UPDATE public.verix_lifetime_counters
    SET
      total_searches = GREATEST(0, total_searches + v_delta_search),
      total_no_record_results = GREATEST(0, total_no_record_results + v_delta_no_record),
      updated_at = clock_timestamp()
    WHERE singleton = true;
  END IF;

  -- One upsert per aggregate only. No event, plate, installation ID or raw
  -- query ID is persisted. Use the original final-result date for outcomes.
  IF v_delta_search > 0
     AND p_occurred_at >= v_metrics_started_at
     AND v_stat_date >= v_min_stat_date THEN
    INSERT INTO public.verix_daily_metrics (
      stat_date, consultations, no_record_results, errors, updated_at
    )
    VALUES (v_stat_date, 1, 0, 0, clock_timestamp())
    ON CONFLICT (stat_date) DO UPDATE
      SET consultations = public.verix_daily_metrics.consultations + 1,
          updated_at = clock_timestamp();
  END IF;

  IF v_delta_no_record > 0
     AND v_new_final_at IS NOT NULL
     AND v_new_final_at >= v_metrics_started_at
     AND v_final_stat_date >= v_min_stat_date THEN
    INSERT INTO public.verix_daily_metrics (
      stat_date, consultations, no_record_results, errors, updated_at
    )
    VALUES (v_final_stat_date, 0, 1, 0, clock_timestamp())
    ON CONFLICT (stat_date) DO UPDATE
      SET no_record_results = public.verix_daily_metrics.no_record_results + 1,
          updated_at = clock_timestamp();
  END IF;

  IF v_delta_error > 0
     AND v_new_final_at IS NOT NULL
     AND v_new_final_at >= v_metrics_started_at
     AND v_final_stat_date >= v_min_stat_date THEN
    INSERT INTO public.verix_daily_metrics (
      stat_date, consultations, no_record_results, errors, updated_at
    )
    VALUES (v_final_stat_date, 0, 0, 1, clock_timestamp())
    ON CONFLICT (stat_date) DO UPDATE
      SET errors = public.verix_daily_metrics.errors + 1,
          updated_at = clock_timestamp();
  END IF;

  RETURN v_delta_search <> 0
      OR v_delta_no_record <> 0
      OR v_delta_error <> 0;
END;
$function$


UPDATE public.verix_lifetime_query_state
SET expires_at = LEAST(expires_at, updated_at + interval '7 days')
WHERE expires_at > updated_at + interval '7 days';

COMMENT ON TABLE public.verix_lifetime_query_state IS
  'Short-lived hashed idempotency state for vehicle consultation counters; seven-day retention. No plates or raw event payloads are stored.';
