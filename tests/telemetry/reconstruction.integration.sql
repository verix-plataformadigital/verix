-- Functional regression fixture: one lookup start per real query; one outcome per
-- query cohort; conflicting outcomes stay separate; activity uses server receipt time.
INSERT INTO public.verix2_installations(installation_id,first_seen,last_seen,app_version)
VALUES
 ('A',now()-interval '2 hours',now()-interval '10 minutes','1.5'),
 ('B',now()-interval '2 hours',now()-interval '10 minutes','1.5'),
 ('C',now()-interval '2 hours',now()-interval '10 minutes','1.5'),
 ('D',now()-interval '2 hours',now()-interval '10 minutes','1.5'),
 ('E',now()-interval '2 hours',now()-interval '10 minutes','1.5'),
 ('F',now()-interval '2 hours',now()-interval '10 minutes','1.5');

INSERT INTO public.verix2_events
(event_id,installation_id,query_id,event,occurred_at,app_version,metadata,created_at)
VALUES
 ('q1-start','A','q-insured','vehicle_lookup',now()-interval '120 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q1-pending','A','q-insured','vehicle_insurance_pending',now()-interval '119 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q1-yes','A','q-insured','vehicle_insurance_yes',now()-interval '118 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q1-imt-inspection-1','A','q-insured','imt_loaded',now()-interval '117 minutes','1.5','{"source":"inspecao","resultConfirmed":true}',now()-interval '10 minutes'),
 ('q1-imt-inspection-2','A','q-insured','imt_loaded',now()-interval '116 minutes 50 seconds','1.5','{"source":"inspecao","resultConfirmed":true}',now()-interval '10 minutes'),
 ('q1-imt-livrete','A','q-insured','imt_loaded',now()-interval '116 minutes','1.5','{"source":"livrete","resultConfirmed":true}',now()-interval '10 minutes'),
 ('q1-nav-ins-start','A','q-insured','imt_navigation_start',now()-interval '115 minutes','1.5','{"source":"inspecao","navigationOutcome":"started","durationMs":0}',now()-interval '10 minutes'),
 ('q1-nav-ins-loaded','A','q-insured','imt_navigation_loaded',now()-interval '114 minutes','1.5','{"source":"inspecao","navigationOutcome":"cross_origin_unverified","durationMs":900}',now()-interval '10 minutes'),
 ('q1-nav-liv-start','A','q-insured','imt_navigation_start',now()-interval '113 minutes','1.5','{"source":"livrete","navigationOutcome":"started","durationMs":0}',now()-interval '10 minutes'),
 ('q1-nav-liv-error','A','q-insured','imt_navigation_error',now()-interval '112 minutes','1.5','{"source":"livrete","navigationOutcome":"timeout","durationMs":30000}',now()-interval '10 minutes'),

 ('q2-start','B','q-uninsured','vehicle_lookup',now()-interval '90 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q2-pending','B','q-uninsured','vehicle_insurance_pending',now()-interval '89 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q2-no-1','B','q-uninsured','vehicle_insurance_no',now()-interval '88 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q2-no-2','B','q-uninsured','vehicle_insurance_no',now()-interval '87 minutes','1.5','{}',now()-interval '10 minutes'),

 ('q3-start','C','q-conflict','vehicle_lookup',now()-interval '60 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q3-yes','C','q-conflict','vehicle_insurance_yes',now()-interval '59 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q3-no','C','q-conflict','vehicle_insurance_no',now()-interval '58 minutes','1.5','{}',now()-interval '10 minutes'),

 ('q4-orphan-pending','D','q-orphan','vehicle_insurance_pending',now()-interval '50 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q4-orphan-yes','D','q-orphan','vehicle_insurance_yes',now()-interval '49 minutes','1.5','{}',now()-interval '10 minutes'),

 ('q5-start','D','q-pending','vehicle_lookup',now()-interval '40 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q5-pending','D','q-pending','vehicle_insurance_pending',now()-interval '39 minutes','1.5','{}',now()-interval '10 minutes'),

 ('q6-start','E','q-incomplete','vehicle_lookup',now()-interval '30 minutes','1.5','{}',now()-interval '10 minutes'),

 ('q7-start','F','q-error','vehicle_lookup',now()-interval '20 minutes','1.5','{}',now()-interval '10 minutes'),
 ('q7-error','F','q-error','vehicle_insurance_error',now()-interval '19 minutes','1.5','{"asfDiagnostic":{"asfErrorType":"network","asfDurationMs":120}}',now()-interval '10 minutes'),

 ('missing-query-id','E',NULL,'vehicle_lookup',now()-interval '15 minutes','1.5','{}',now()-interval '10 minutes'),
 ('heartbeat-old','B',NULL,'heartbeat',now()-interval '10 minutes','1.5','{}',now()-interval '10 minutes'),
 ('heartbeat-current','A',NULL,'heartbeat',now()-interval '30 seconds','1.5','{}',now()-interval '30 seconds');

DO $$
DECLARE
  a jsonb;
  i jsonb;
  t jsonb;
BEGIN
  a := public.verix2_admin_analytics(now());
  i := a->'insurance'->'24h';
  t := a->'telemetry';

  IF (i->>'started')::int <> 6 THEN
    RAISE EXCEPTION 'expected 6 started queries, got %', i->>'started';
  END IF;
  IF (i->>'finals')::int <> 3 THEN
    RAISE EXCEPTION 'expected 3 valid final queries, got %', i->>'finals';
  END IF;
  IF (i->>'insured')::int <> 1 OR (i->>'uninsured')::int <> 1 OR (i->>'errors')::int <> 1 THEN
    RAISE EXCEPTION 'outcomes not counted once per query: %', i;
  END IF;
  IF (i->>'pending')::int <> 1 OR (i->>'incomplete')::int <> 1 THEN
    RAISE EXCEPTION 'pending/incomplete distinction failed: %', i;
  END IF;
  IF (i->>'conflicting_final')::int <> 1 THEN
    RAISE EXCEPTION 'conflicting final result was not surfaced: %', i;
  END IF;
  IF (i->>'duplicate_final_events')::int <> 2 OR (i->>'multi_final')::int <> 2 THEN
    RAISE EXCEPTION 'duplicate finals diagnostics failed: %', i;
  END IF;
  IF (t->>'query_events_missing_id_30d')::int <> 1 THEN
    RAISE EXCEPTION 'missing query_id coverage counter failed: %', t;
  END IF;
  IF (t->>'query_outcomes_without_start_30d')::int <> 1 THEN
    RAISE EXCEPTION 'orphan query coverage counter failed: %', t;
  END IF;
  IF (t->>'conflicting_final_queries_30d')::int <> 1 THEN
    RAISE EXCEPTION 'conflict quality counter failed: %', t;
  END IF;
  IF (t->>'duplicate_final_events_30d')::int <> 2 THEN
    RAISE EXCEPTION 'duplicate-final quality counter failed: %', t;
  END IF;
  IF (t->>'imt_duplicate_query_source_groups_30d')::int <> 1 THEN
    RAISE EXCEPTION 'IMT duplicate source groups counter failed: %', t;
  END IF;
  IF (t->>'imt_navigation_starts_30d')::int <> 2 OR
     (t->>'imt_navigation_loaded_30d')::int <> 1 OR
     (t->>'imt_navigation_errors_30d')::int <> 1 THEN
    RAISE EXCEPTION 'IMT navigation lifecycle counters failed: %', t;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(t->'imt_navigation_by_source_30d') x
    WHERE x->>'source'='inspecao' AND (x->>'started')::int=1 AND (x->>'navigation_loaded')::int=1 AND (x->>'errors')::int=0
  ) THEN
    RAISE EXCEPTION 'inspection IMT source breakdown failed: %', t->'imt_navigation_by_source_30d';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(t->'imt_navigation_by_source_30d') x
    WHERE x->>'source'='livrete' AND (x->>'started')::int=1 AND (x->>'navigation_loaded')::int=0 AND (x->>'errors')::int=1
  ) THEN
    RAISE EXCEPTION 'livrete IMT source breakdown failed: %', t->'imt_navigation_by_source_30d';
  END IF;
  IF (a->'overview'->>'online_now')::int <> 1 THEN
    RAISE EXCEPTION 'active installations must use server receipt time, got %', a->'overview'->>'online_now';
  END IF;
  IF (a->'overview'->>'actions_24h')::int >= (a->'overview'->>'events_24h')::int THEN
    RAISE EXCEPTION 'action count must exclude heartbeat events';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(a->'errors'->'types') x
    WHERE x->>'kind'='network' AND (x->>'qty')::int=1 AND (x->>'raw_events')::int=1
  ) THEN
    RAISE EXCEPTION 'error metrics must expose distinct queries and raw events';
  END IF;
END $$;

-- RPC is idempotent on event_id and inserts parent rows before events.
DO $$
DECLARE
  first_result jsonb;
  replay_result jsonb;
  event_count integer;
BEGIN
  first_result := public.verix2_ingest_telemetry(
    jsonb_build_array(jsonb_build_object(
      'event_id','rpc-idempotency-event','installation_id','rpc-install',
      'session_id','rpc-session','tab_id','rpc-tab','query_id','rpc-query',
      'event','app_open','module',NULL,'occurred_at',now(),'app_version','1.5',
      'device_type','desktop','browser','test','metadata','{}'::jsonb
    )),
    jsonb_build_array(jsonb_build_object(
      'installation_id','rpc-install','first_seen',now(),'last_seen',now(),
      'app_version','1.5','device_type','desktop','browser','test','os','Linux'
    )),
    jsonb_build_array(jsonb_build_object(
      'session_id','rpc-session','installation_id','rpc-install','tab_id','rpc-tab',
      'started_at',now(),'last_seen',now()
    ))
  );
  IF (first_result->>'events_inserted')::int <> 1 THEN
    RAISE EXCEPTION 'first RPC insert should insert one event: %', first_result;
  END IF;

  replay_result := public.verix2_ingest_telemetry(
    jsonb_build_array(jsonb_build_object(
      'event_id','rpc-idempotency-event','installation_id','rpc-install',
      'session_id','rpc-session','tab_id','rpc-tab','query_id','rpc-query',
      'event','app_open','module',NULL,'occurred_at',now(),'app_version','1.5',
      'device_type','desktop','browser','test','metadata','{}'::jsonb
    )),
    jsonb_build_array(jsonb_build_object(
      'installation_id','rpc-install','first_seen',now(),'last_seen',now(),
      'app_version','1.5','device_type','desktop','browser','test','os','Linux'
    )),
    jsonb_build_array(jsonb_build_object(
      'session_id','rpc-session','installation_id','rpc-install','tab_id','rpc-tab',
      'started_at',now(),'last_seen',now()
    ))
  );
  IF (replay_result->>'events_inserted')::int <> 0 THEN
    RAISE EXCEPTION 'replayed event_id must not create duplicate event: %', replay_result;
  END IF;
  SELECT count(*) INTO event_count FROM public.verix2_events WHERE event_id='rpc-idempotency-event';
  IF event_count <> 1 THEN
    RAISE EXCEPTION 'idempotent replay produced % rows', event_count;
  END IF;

  BEGIN
    PERFORM public.verix2_ingest_telemetry(
      jsonb_build_array(jsonb_build_object(
        'event_id','rpc-orphan-event','installation_id','missing-parent',
        'event','app_open','occurred_at',now(),'metadata','{}'::jsonb
      )),
      '[]'::jsonb,
      '[]'::jsonb
    );
    RAISE EXCEPTION 'expected parent foreign key violation';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.verix2_events WHERE event_id='rpc-orphan-event') THEN
    RAISE EXCEPTION 'failed transaction left an orphan event behind';
  END IF;
END $$;
