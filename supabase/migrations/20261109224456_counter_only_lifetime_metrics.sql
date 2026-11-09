-- VÉRIX: permanent lifetime counters only. Applied in production on 2026-11-09.
-- Retains two cumulative values. Temporary deduplication stores only MD5 query-ID
-- hashes for 45 days; it does not store plates, raw query IDs or search history.

CREATE TABLE IF NOT EXISTS public.verix_lifetime_counters (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  total_searches bigint NOT NULL DEFAULT 0 CHECK (total_searches >= 0),
  total_vehicles_without_insurance bigint NOT NULL DEFAULT 0 CHECK (total_vehicles_without_insurance >= 0),
  history_started_at timestamptz,
  cutover_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  dedupe_from timestamptz NOT NULL DEFAULT (clock_timestamp() - interval '45 days'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.verix_lifetime_query_state (
  query_hash text PRIMARY KEY CHECK (query_hash ~ '^[0-9a-f]{32}$'),
  has_lookup boolean NOT NULL DEFAULT false,
  final_state text CHECK (final_state IS NULL OR final_state IN ('yes','no','error','conflict')),
  expires_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS verix_lifetime_query_state_expiry_idx ON public.verix_lifetime_query_state(expires_at);
ALTER TABLE public.verix_lifetime_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verix_lifetime_query_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix_lifetime_counters,public.verix_lifetime_query_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.verix_lifetime_counters,public.verix_lifetime_query_state TO service_role;

LOCK TABLE public.verix2_events IN SHARE ROW EXCLUSIVE MODE;
WITH lookups AS (
 SELECT DISTINCT NULLIF(BTRIM(query_id),'') query_id FROM public.verix2_events
 WHERE event='vehicle_lookup' AND NULLIF(BTRIM(query_id),'') IS NOT NULL
), finals AS (
 SELECT NULLIF(BTRIM(query_id),'') query_id,COUNT(*) final_count,COUNT(DISTINCT event) final_types,MIN(event) final_event
 FROM public.verix2_events WHERE event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
 AND NULLIF(BTRIM(query_id),'') IS NOT NULL GROUP BY NULLIF(BTRIM(query_id),'')
), totals AS (
 SELECT (SELECT COUNT(*) FROM lookups) searches,
 (SELECT COUNT(*) FROM lookups l JOIN finals f USING(query_id)
  WHERE f.final_count=1 AND f.final_types=1 AND f.final_event='vehicle_insurance_no') without_insurance,
 (SELECT MIN(occurred_at) FROM public.verix2_events
  WHERE event='vehicle_lookup' AND NULLIF(BTRIM(query_id),'') IS NOT NULL) first_lookup
)
INSERT INTO public.verix_lifetime_counters(singleton,total_searches,total_vehicles_without_insurance,history_started_at,cutover_at,dedupe_from,updated_at)
SELECT true,searches,without_insurance,first_lookup,clock_timestamp(),clock_timestamp()-interval '45 days',clock_timestamp()
FROM totals ON CONFLICT(singleton) DO NOTHING;

INSERT INTO public.verix_lifetime_query_state(query_hash,has_lookup,final_state,expires_at,updated_at)
SELECT md5(LOWER(BTRIM(e.query_id))),BOOL_OR(e.event='vehicle_lookup'),
 CASE
  WHEN COUNT(*) FILTER(WHERE e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'))=0 THEN NULL
  WHEN COUNT(*) FILTER(WHERE e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'))=1
   THEN CASE MIN(e.event) FILTER(WHERE e.event IN ('vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error'))
    WHEN 'vehicle_insurance_yes' THEN 'yes' WHEN 'vehicle_insurance_no' THEN 'no' ELSE 'error' END
  ELSE 'conflict'
 END,
 clock_timestamp()+interval '45 days',clock_timestamp()
FROM public.verix2_events e CROSS JOIN public.verix_lifetime_counters c
WHERE c.singleton=true AND e.occurred_at>=c.dedupe_from
 AND NULLIF(BTRIM(e.query_id),'') IS NOT NULL
 AND e.event IN ('vehicle_lookup','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
GROUP BY LOWER(BTRIM(e.query_id)) ON CONFLICT(query_hash) DO NOTHING;

CREATE OR REPLACE FUNCTION public.verix_apply_lifetime_metric_event(p_query_id text,p_event text,p_occurred_at timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE
 v_hash text; v_dedupe_from timestamptz;
 v_old_search boolean:=false; v_new_search boolean:=false;
 v_old_final text; v_new_final text; v_incoming_final text; v_expires_at timestamptz;
 v_old_counted_no integer:=0; v_new_counted_no integer:=0; v_delta_search integer:=0; v_delta_no integer:=0;
BEGIN
 IF p_event NOT IN ('vehicle_lookup','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error')
 OR NULLIF(BTRIM(p_query_id),'') IS NULL OR p_occurred_at IS NULL THEN RETURN false; END IF;
 SELECT dedupe_from INTO v_dedupe_from FROM public.verix_lifetime_counters WHERE singleton=true;
 IF v_dedupe_from IS NULL OR p_occurred_at<v_dedupe_from OR p_occurred_at>clock_timestamp()+interval '5 minutes' THEN RETURN false; END IF;
 v_hash:=md5(LOWER(BTRIM(p_query_id)));
 PERFORM pg_advisory_xact_lock(hashtextextended(v_hash,2718281828));
 INSERT INTO public.verix_lifetime_query_state(query_hash,has_lookup,final_state,expires_at,updated_at)
 VALUES(v_hash,false,NULL,clock_timestamp()+interval '45 days',clock_timestamp()) ON CONFLICT(query_hash) DO NOTHING;
 SELECT has_lookup,final_state,expires_at INTO v_old_search,v_old_final,v_expires_at
 FROM public.verix_lifetime_query_state WHERE query_hash=v_hash FOR UPDATE;
 IF v_expires_at<=clock_timestamp() THEN v_old_search:=false; v_old_final:=NULL; END IF;
 v_new_search:=v_old_search OR p_event='vehicle_lookup'; v_new_final:=v_old_final;
 v_incoming_final:=CASE p_event WHEN 'vehicle_insurance_yes' THEN 'yes' WHEN 'vehicle_insurance_no' THEN 'no'
 WHEN 'vehicle_insurance_error' THEN 'error' ELSE NULL END;
 IF v_incoming_final IS NOT NULL THEN
  IF v_new_final IS NULL THEN v_new_final:=v_incoming_final;
  ELSIF v_new_final<>v_incoming_final THEN v_new_final:='conflict'; END IF;
 END IF;
 IF v_new_search AND NOT v_old_search THEN v_delta_search:=1; END IF;
 IF v_old_search AND v_old_final='no' THEN v_old_counted_no:=1; END IF;
 IF v_new_search AND v_new_final='no' THEN v_new_counted_no:=1; END IF;
 v_delta_no:=v_new_counted_no-v_old_counted_no;
 UPDATE public.verix_lifetime_query_state SET has_lookup=v_new_search,final_state=v_new_final,
 expires_at=clock_timestamp()+interval '45 days',updated_at=clock_timestamp() WHERE query_hash=v_hash;
 IF v_delta_search<>0 OR v_delta_no<>0 THEN
  UPDATE public.verix_lifetime_counters SET total_searches=GREATEST(0,total_searches+v_delta_search),
  total_vehicles_without_insurance=GREATEST(0,total_vehicles_without_insurance+v_delta_no),updated_at=clock_timestamp()
  WHERE singleton=true;
  RETURN true;
 END IF;
 RETURN false;
END;
$$;
REVOKE ALL ON FUNCTION public.verix_apply_lifetime_metric_event(text,text,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verix_apply_lifetime_metric_event(text,text,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.verix2_ingest_telemetry(p_events jsonb,p_installations jsonb,p_sessions jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $$
DECLARE v_event record; v_events_accepted bigint:=0; v_metrics_updated bigint:=0;
BEGIN
 IF jsonb_typeof(p_events) IS DISTINCT FROM 'array' OR jsonb_typeof(p_installations) IS DISTINCT FROM 'array'
 OR jsonb_typeof(p_sessions) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'telemetry ingestion expects JSON arrays' USING ERRCODE='22023';
 END IF;
 FOR v_event IN
  SELECT NULLIF(BTRIM(item->>'query_id'),'') query_id,NULLIF(BTRIM(item->>'event'),'') event,
   NULLIF(BTRIM(item->>'occurred_at'),'')::timestamptz occurred_at
  FROM jsonb_array_elements(p_events) AS item
  ORDER BY NULLIF(BTRIM(item->>'query_id'),''),NULLIF(BTRIM(item->>'occurred_at'),'')::timestamptz
 LOOP
  IF v_event.event IS DISTINCT FROM 'heartbeat' THEN v_events_accepted:=v_events_accepted+1; END IF;
  IF v_event.event IN ('vehicle_lookup','vehicle_insurance_yes','vehicle_insurance_no','vehicle_insurance_error') THEN
   IF public.verix_apply_lifetime_metric_event(v_event.query_id,v_event.event,v_event.occurred_at) THEN
    v_metrics_updated:=v_metrics_updated+1;
   END IF;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'events_inserted',v_events_accepted,'metrics_updated',v_metrics_updated,'sessions_detached',0);
END;
$$;
REVOKE ALL ON FUNCTION public.verix2_ingest_telemetry(jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verix2_ingest_telemetry(jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.verix_lifetime_metrics_read()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
 SELECT jsonb_build_object('total_searches',total_searches,
 'total_vehicles_without_insurance',total_vehicles_without_insurance,'history_started_at',history_started_at,'updated_at',updated_at)
 FROM public.verix_lifetime_counters WHERE singleton=true;
$$;
REVOKE ALL ON FUNCTION public.verix_lifetime_metrics_read() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verix_lifetime_metrics_read() TO service_role;

DO $$
DECLARE v_job bigint;
BEGIN
 SELECT jobid INTO v_job FROM cron.job WHERE jobname='verix_lifetime_query_state_expiry';
 IF v_job IS NOT NULL THEN PERFORM cron.unschedule(v_job); END IF;
 PERFORM cron.schedule('verix_lifetime_query_state_expiry','23 * * * *',
 'DELETE FROM public.verix_lifetime_query_state WHERE expires_at<=clock_timestamp();');
END;
$$;
