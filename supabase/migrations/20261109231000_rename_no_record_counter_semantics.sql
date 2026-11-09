-- Clarify the lifetime metric: vehicle_insurance_no is the ASF "no record" outcome.
-- It is not legal proof that the vehicle is uninsured; expose an accurately named counter.

ALTER TABLE public.verix_lifetime_counters
  RENAME COLUMN total_vehicles_without_insurance TO total_no_record_results;

ALTER TABLE public.verix_lifetime_query_state
  DROP CONSTRAINT IF EXISTS verix_lifetime_query_state_final_state_check;

UPDATE public.verix_lifetime_query_state
SET final_state='no_record'
WHERE final_state='no';

ALTER TABLE public.verix_lifetime_query_state
  ADD CONSTRAINT verix_lifetime_query_state_final_state_check
  CHECK (final_state IS NULL OR final_state IN ('yes','no_record','error','conflict'));

CREATE OR REPLACE FUNCTION public.verix_apply_lifetime_metric_event(
  p_query_id text,
  p_event text,
  p_occurred_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
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

  v_hash := md5(LOWER(BTRIM(p_query_id)));
  PERFORM pg_advisory_xact_lock(hashtextextended(v_hash, 2718281828));

  INSERT INTO public.verix_lifetime_query_state (
    query_hash, has_lookup, final_state, expires_at, updated_at
  )
  VALUES (
    v_hash, false, NULL, clock_timestamp() + interval '45 days', clock_timestamp()
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

  UPDATE public.verix_lifetime_query_state
  SET
    has_lookup = v_new_search,
    final_state = v_new_final,
    expires_at = clock_timestamp() + interval '45 days',
    updated_at = clock_timestamp()
  WHERE query_hash = v_hash;

  IF v_delta_search <> 0 OR v_delta_no_record <> 0 THEN
    UPDATE public.verix_lifetime_counters
    SET
      total_searches = GREATEST(0, total_searches + v_delta_search),
      total_no_record_results = GREATEST(0, total_no_record_results + v_delta_no_record),
      updated_at = clock_timestamp()
    WHERE singleton = true;
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.verix_apply_lifetime_metric_event(text,text,timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_apply_lifetime_metric_event(text,text,timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.verix_lifetime_metrics_read()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'total_searches', c.total_searches,
    'total_no_record_results', c.total_no_record_results,
    'history_started_at', c.history_started_at,
    'updated_at', c.updated_at
  )
  FROM public.verix_lifetime_counters c
  WHERE c.singleton = true;
$$;

REVOKE ALL ON FUNCTION public.verix_lifetime_metrics_read()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_lifetime_metrics_read()
  TO service_role;
