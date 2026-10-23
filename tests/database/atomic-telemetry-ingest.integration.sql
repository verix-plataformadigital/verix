\set ON_ERROR_STOP on
SET ROLE service_role;
DO $test$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_result jsonb;
  v_seen timestamptz;
BEGIN
  IF has_function_privilege('anon', 'public.verix2_ingest_telemetry(jsonb,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute telemetry ingest';
  END IF;
  IF has_function_privilege('authenticated', 'public.verix2_ingest_telemetry(jsonb,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must not execute telemetry ingest';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.verix2_ingest_telemetry(jsonb,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must execute telemetry ingest';
  END IF;

  v_result := public.verix2_ingest_telemetry(
    jsonb_build_array(jsonb_build_object(
      'event_id','evt-first','installation_id','inst-first','session_id','sess-first','tab_id','tab-first',
      'query_id','query-first','event','vehicle_lookup','module','consulta','occurred_at',v_now,
      'app_version','2.0-test','device_type','desktop','browser','postgres-integration-test',
      'metadata',jsonb_build_object('test',true)
    )),
    jsonb_build_array(jsonb_build_object(
      'installation_id','inst-first','first_seen',v_now,'last_seen',v_now,'app_version','2.0-test',
      'device_type','desktop','browser','postgres-integration-test','os','linux'
    )),
    jsonb_build_array(jsonb_build_object(
      'session_id','sess-first','installation_id','inst-first','tab_id','tab-first',
      'started_at',v_now,'last_seen',v_now
    ))
  );
  IF (v_result->>'events_inserted')::bigint <> 1 THEN
    RAISE EXCEPTION 'expected one inserted event; got %',v_result;
  END IF;
  SELECT last_seen INTO v_seen FROM public.verix2_installations WHERE installation_id='inst-first';
  IF v_seen IS DISTINCT FROM v_now THEN RAISE EXCEPTION 'installation last_seen wrong: %',v_seen; END IF;
  SELECT last_seen INTO v_seen FROM public.verix2_sessions WHERE session_id='sess-first';
  IF v_seen IS DISTINCT FROM v_now THEN RAISE EXCEPTION 'session last_seen wrong: %',v_seen; END IF;

  -- Partial unique-index conflict: no event inserted must roll back new parent rows.
  v_result := public.verix2_ingest_telemetry(
    jsonb_build_array(jsonb_build_object(
      'event_id','evt-query-duplicate','installation_id','inst-duplicate','session_id','sess-duplicate',
      'tab_id','tab-duplicate','query_id','query-first','event','vehicle_lookup','module','consulta',
      'occurred_at',v_now+interval '1 second','app_version','2.0-test','device_type','desktop',
      'browser','postgres-integration-test','metadata',jsonb_build_object('test',true)
    )),
    jsonb_build_array(jsonb_build_object(
      'installation_id','inst-duplicate','first_seen',v_now+interval '1 second',
      'last_seen',v_now+interval '1 second','app_version','2.0-test','device_type','desktop',
      'browser','postgres-integration-test','os','linux'
    )),
    jsonb_build_array(jsonb_build_object(
      'session_id','sess-duplicate','installation_id','inst-duplicate','tab_id','tab-duplicate',
      'started_at',v_now+interval '1 second','last_seen',v_now+interval '1 second'
    ))
  );
  IF (v_result->>'events_inserted')::bigint <> 0 THEN RAISE EXCEPTION 'duplicate query inserted an event'; END IF;
  IF EXISTS(SELECT 1 FROM public.verix2_installations WHERE installation_id='inst-duplicate')
     OR EXISTS(SELECT 1 FROM public.verix2_sessions WHERE session_id='sess-duplicate')
     OR EXISTS(SELECT 1 FROM public.verix2_events WHERE event_id='evt-query-duplicate') THEN
    RAISE EXCEPTION 'duplicate-only ingestion left parent rows behind';
  END IF;

  -- Event FK failure must roll back any installation/session writes in the RPC.
  BEGIN
    PERFORM public.verix2_ingest_telemetry(
      jsonb_build_array(jsonb_build_object(
        'event_id','evt-fk-fail','installation_id','inst-fk-fail','session_id','sess-does-not-exist',
        'tab_id','tab-fk-fail','query_id',NULL,'event','heartbeat','module',NULL,
        'occurred_at',v_now+interval '2 seconds','app_version','2.0-test','device_type','desktop',
        'browser','postgres-integration-test','metadata',jsonb_build_object('test',true)
      )),
      jsonb_build_array(jsonb_build_object(
        'installation_id','inst-fk-fail','first_seen',v_now+interval '2 seconds',
        'last_seen',v_now+interval '2 seconds','app_version','2.0-test','device_type','desktop',
        'browser','postgres-integration-test','os','linux'
      )),
      jsonb_build_array(jsonb_build_object(
        'session_id','sess-fk-fail','installation_id','inst-fk-fail','tab_id','tab-fk-fail',
        'started_at',v_now+interval '2 seconds','last_seen',v_now+interval '2 seconds'
      ))
    );
    RAISE EXCEPTION 'expected foreign key violation was not raised' USING ERRCODE='PZ999';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF EXISTS(SELECT 1 FROM public.verix2_installations WHERE installation_id='inst-fk-fail')
     OR EXISTS(SELECT 1 FROM public.verix2_sessions WHERE session_id='sess-fk-fail')
     OR EXISTS(SELECT 1 FROM public.verix2_events WHERE event_id='evt-fk-fail') THEN
    RAISE EXCEPTION 'foreign key error did not roll back the whole batch';
  END IF;

  -- Existing session IDs cannot be rebound to another installation.
  BEGIN
    PERFORM public.verix2_ingest_telemetry(
      jsonb_build_array(jsonb_build_object(
        'event_id','evt-session-collision','installation_id','inst-other','session_id','sess-first',
        'tab_id','tab-other','query_id',NULL,'event','heartbeat','module',NULL,
        'occurred_at',v_now+interval '3 seconds','app_version','2.0-test','device_type','desktop',
        'browser','postgres-integration-test','metadata',jsonb_build_object('test',true)
      )),
      jsonb_build_array(jsonb_build_object(
        'installation_id','inst-other','first_seen',v_now+interval '3 seconds',
        'last_seen',v_now+interval '3 seconds','app_version','2.0-test','device_type','desktop',
        'browser','postgres-integration-test','os','linux'
      )),
      jsonb_build_array(jsonb_build_object(
        'session_id','sess-first','installation_id','inst-other','tab_id','tab-other',
        'started_at',v_now+interval '3 seconds','last_seen',v_now+interval '3 seconds'
      ))
    );
    RAISE EXCEPTION 'expected session identity violation was not raised' USING ERRCODE='PZ999';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  IF EXISTS(SELECT 1 FROM public.verix2_installations WHERE installation_id='inst-other')
     OR EXISTS(SELECT 1 FROM public.verix2_events WHERE event_id='evt-session-collision') THEN
    RAISE EXCEPTION 'session identity failure did not roll back the batch';
  END IF;

  RAISE NOTICE 'atomic telemetry ingestion integration checks passed';
END;
$test$;
RESET ROLE;
