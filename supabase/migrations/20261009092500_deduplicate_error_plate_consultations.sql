-- Deduplicate error analytics by query ID and reject partial plate fragments.
-- Use pg_get_functiondef so unrelated analytics logic remains byte-for-byte intact.
DO $migration$
DECLARE
  v_definition text;
  v_old_types text := $old$
  SELECT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown') kind,
         count(*) qty,
$old$;
  v_new_types text := $new$
  SELECT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown') kind,
         count(DISTINCT query_id) qty,
         count(*) event_qty,
$new$;
  v_old_bursts text := $old$
  SELECT date_trunc('minute',occurred_at) minute_key,count(*) qty,count(DISTINCT installation_id) installs
  FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
  GROUP BY 1 ORDER BY qty DESC,minute_key DESC LIMIT 15
$old$;
  v_new_bursts text := $new$
  SELECT date_trunc('minute',occurred_at) minute_key,count(DISTINCT query_id) qty,count(*) event_qty,count(DISTINCT installation_id) installs
  FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24 AND query_id IS NOT NULL
  GROUP BY 1 ORDER BY qty DESC,minute_key DESC LIMIT 15
$new$;
  v_old_installs text := $old$
  SELECT installation_id,count(*) qty,count(DISTINCT query_id) queries,max(occurred_at) last_at
  FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
  GROUP BY 1 ORDER BY qty DESC,last_at DESC LIMIT 15
$old$;
  v_new_installs text := $new$
  SELECT installation_id,count(DISTINCT query_id) qty,count(*) event_qty,count(DISTINCT query_id) queries,max(occurred_at) last_at
  FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24 AND query_id IS NOT NULL
  GROUP BY 1 ORDER BY qty DESC,last_at DESC LIMIT 15
$new$;
  v_old_signatures text := $old$
         count(*) qty,count(DISTINCT query_id) queries,count(DISTINCT installation_id) installs
$old$;
  v_new_signatures text := $new$
         count(DISTINCT query_id) qty,count(*) event_qty,count(DISTINCT query_id) queries,count(DISTINCT installation_id) installs
$new$;
  v_old_plates text := $old$
err_plates AS (
  SELECT upper(regexp_replace(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula',''),'[^A-Z0-9]','','g')) plate_key,
         max(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula')) plate,
         count(*) qty,max(occurred_at) last_at,
         array_agg(DISTINCT coalesce(metadata->'asfDiagnostic'->>'asfErrorType','unknown')) kinds
  FROM ev,b
  WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24
    AND coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')<>''
  GROUP BY 1 ORDER BY qty DESC,last_at DESC LIMIT 20
),
$old$;
  v_new_plates text := $new$
err_plates AS (
  SELECT p.plate_key,
         max(p.plate_raw) plate,
         count(DISTINCT e.query_id) qty,
         count(*) event_qty,
         max(e.occurred_at) last_at,
         array_agg(DISTINCT coalesce(e.metadata->'asfDiagnostic'->>'asfErrorType','unknown')) kinds
  FROM ev e
  CROSS JOIN b
  CROSS JOIN LATERAL (
    SELECT c.raw AS plate_raw,
           regexp_replace(upper(c.raw),'[^A-Z0-9]','','g') AS plate_key
    FROM (VALUES
      (1,e.metadata->'asfDiagnostic'->>'matricula'),
      (2,e.metadata->>'matricula'),
      (3,e.metadata->>'matriculaNormalizada')
    ) AS c(priority,raw)
    WHERE regexp_replace(upper(coalesce(c.raw,'')),'[^A-Z0-9]','','g') ~ '^[A-Z0-9]{6,8}
  GROUP BY p.plate_key ORDER BY qty DESC,last_at DESC LIMIT 20
),
$new$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
  INTO v_definition;

  IF position(v_old_types in v_definition)=0
     OR position(v_old_bursts in v_definition)=0
     OR position(v_old_installs in v_definition)=0
     OR position(v_old_signatures in v_definition)=0
     OR position(v_old_plates in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected VÉRIX admin analytics definition changed; refusing partial patch';
  END IF;

  v_definition := replace(v_definition, v_old_types, v_new_types);
  v_definition := replace(v_definition, v_old_bursts, v_new_bursts);
  v_definition := replace(v_definition, v_old_installs, v_new_installs);
  v_definition := replace(v_definition, v_old_signatures, v_new_signatures);
  v_definition := replace(v_definition, v_old_plates, v_new_plates);

  EXECUTE v_definition;
END
$migration$;

    ORDER BY c.priority
    LIMIT 1
  ) p
  WHERE e.event='vehicle_insurance_error' AND e.occurred_at>=b.s24
    AND e.query_id IS NOT NULL
    AND p.plate_key ~ '^[A-Z0-9]{6,8}
  GROUP BY p.plate_key ORDER BY qty DESC,last_at DESC LIMIT 20
),
$new$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
  INTO v_definition;

  IF position(v_old_types in v_definition)=0
     OR position(v_old_bursts in v_definition)=0
     OR position(v_old_installs in v_definition)=0
     OR position(v_old_signatures in v_definition)=0
     OR position(v_old_plates in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected VÉRIX admin analytics definition changed; refusing partial patch';
  END IF;

  v_definition := replace(v_definition, v_old_types, v_new_types);
  v_definition := replace(v_definition, v_old_bursts, v_new_bursts);
  v_definition := replace(v_definition, v_old_installs, v_new_installs);
  v_definition := replace(v_definition, v_old_signatures, v_new_signatures);
  v_definition := replace(v_definition, v_old_plates, v_new_plates);

  EXECUTE v_definition;
END
$migration$;

  GROUP BY p.plate_key ORDER BY qty DESC,last_at DESC LIMIT 20
),
$new$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
  INTO v_definition;

  IF position(v_old_types in v_definition)=0
     OR position(v_old_bursts in v_definition)=0
     OR position(v_old_installs in v_definition)=0
     OR position(v_old_signatures in v_definition)=0
     OR position(v_old_plates in v_definition)=0 THEN
    RAISE EXCEPTION 'Expected VÉRIX admin analytics definition changed; refusing partial patch';
  END IF;

  v_definition := replace(v_definition, v_old_types, v_new_types);
  v_definition := replace(v_definition, v_old_bursts, v_new_bursts);
  v_definition := replace(v_definition, v_old_installs, v_new_installs);
  v_definition := replace(v_definition, v_old_signatures, v_new_signatures);
  v_definition := replace(v_definition, v_old_plates, v_new_plates);

  EXECUTE v_definition;
END
$migration$;
