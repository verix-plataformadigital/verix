-- Add a separate count for ASF errors whose captured plate matches one of
-- the four Portuguese registration layouts. The general error inventory keeps
-- all error cases; the main dashboard uses only errors_valid_plate.
DO $migration$
DECLARE
  v_definition text;
  v_old_24 text := $old24$
      'errors',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='valid' AND final_event='vehicle_insurance_error'),
$old24$;
  v_new_24 text := $new24$
      'errors',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'errors_valid_plate',(SELECT count(*) FROM query_quality WHERE first_at>=b.s24 AND outcome_state='valid' AND final_event='vehicle_insurance_error'
        AND regexp_replace(upper(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')), '[[:space:]-]', '', 'g')
          ~ '^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$'),
$new24$;
  v_old_7 text := $old7$
      'errors',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='valid' AND final_event='vehicle_insurance_error'),
$old7$;
  v_new_7 text := $new7$
      'errors',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'errors_valid_plate',(SELECT count(*) FROM query_quality WHERE first_at>=b.s7 AND outcome_state='valid' AND final_event='vehicle_insurance_error'
        AND regexp_replace(upper(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')), '[[:space:]-]', '', 'g')
          ~ '^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$'),
$new7$;
  v_old_30 text := $old30$
      'errors',(SELECT count(*) FROM query_quality WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'),
$old30$;
  v_new_30 text := $new30$
      'errors',(SELECT count(*) FROM query_quality WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'errors_valid_plate',(SELECT count(*) FROM query_quality WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'
        AND regexp_replace(upper(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')), '[[:space:]-]', '', 'g')
          ~ '^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$'),
$new30$;
  v_old_query_quality text := $old_quality$
         fc.event AS final_event,
         fc.occurred_at AS final_at,
         CASE
$old_quality$;
  v_new_query_quality text := $new_quality$
         fc.event AS final_event,
         fc.occurred_at AS final_at,
         fc.metadata,
         CASE
$new_quality$;
  v_old_total_final_counts text := $old_total$
final_counts_total AS (
  SELECT query_id,count(*) AS final_event_count,count(DISTINCT event) AS final_type_count,
         min(event) AS event,max(occurred_at) AS occurred_at
  FROM ev_total
$old_total$;
  v_new_total_final_counts text := $new_total$
final_counts_total AS (
  SELECT query_id,count(*) AS final_event_count,count(DISTINCT event) AS final_type_count,
         min(event) AS event,max(occurred_at) AS occurred_at,
         (array_agg(metadata ORDER BY occurred_at DESC,event_id DESC))[1] AS metadata
  FROM ev_total
$new_total$;
  v_old_total_quality text := $old_quality_total$
  SELECT qt.query_id,qt.first_at,COALESCE(fc.final_event_count,0) AS final_event_count,
         COALESCE(fc.final_type_count,0) AS final_type_count,fc.event AS final_event,fc.occurred_at AS final_at,
         CASE
$old_quality_total$;
  v_new_total_quality text := $new_quality_total$
  SELECT qt.query_id,qt.first_at,COALESCE(fc.final_event_count,0) AS final_event_count,
         COALESCE(fc.final_type_count,0) AS final_type_count,fc.event AS final_event,fc.occurred_at AS final_at,fc.metadata,
         CASE
$new_quality_total$;
  v_old_total_errors text := $old_total_errors$
      'errors',(SELECT count(*) FROM query_quality_total WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'),
$old_total_errors$;
  v_new_total_errors text := $new_total_errors$
      'errors',(SELECT count(*) FROM query_quality_total WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'),
      'errors_valid_plate',(SELECT count(*) FROM query_quality_total WHERE outcome_state='valid' AND final_event='vehicle_insurance_error'
        AND regexp_replace(upper(coalesce(metadata->'asfDiagnostic'->>'matricula',metadata->>'matricula','')), '[[:space:]-]', '', 'g')
          ~ '^(?:[A-Z]{2}[0-9]{4}|[0-9]{4}[A-Z]{2}|[0-9]{2}[A-Z]{2}[0-9]{2}|[A-Z]{2}[0-9]{2}[A-Z]{2})$'),
$new_total_errors$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
    INTO v_definition;

  IF position(v_old_24 IN v_definition)=0
     OR position(v_old_7 IN v_definition)=0
     OR position(v_old_30 IN v_definition)=0
     OR position(v_old_query_quality IN v_definition)=0
     OR position(v_old_total_final_counts IN v_definition)=0
     OR position(v_old_total_quality IN v_definition)=0
     OR position(v_old_total_errors IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected analytics definitions not found; refusing a partial summary-metric change';
  END IF;

  IF position('errors_valid_plate' IN v_definition)>0 THEN
    RAISE EXCEPTION 'Valid-plate error metrics already exist; refusing duplicate migration';
  END IF;

  v_definition := replace(v_definition,v_old_24,v_new_24);
  v_definition := replace(v_definition,v_old_7,v_new_7);
  v_definition := replace(v_definition,v_old_30,v_new_30);
  v_definition := replace(v_definition,v_old_query_quality,v_new_query_quality);
  v_definition := replace(v_definition,v_old_total_final_counts,v_new_total_final_counts);
  v_definition := replace(v_definition,v_old_total_quality,v_new_total_quality);
  v_definition := replace(v_definition,v_old_total_errors,v_new_total_errors);

  IF position(v_new_24 IN v_definition)=0
     OR position(v_new_7 IN v_definition)=0
     OR position(v_new_30 IN v_definition)=0
     OR position(v_new_query_quality IN v_definition)=0
     OR position(v_new_total_final_counts IN v_definition)=0
     OR position(v_new_total_quality IN v_definition)=0
     OR position(v_new_total_errors IN v_definition)=0 THEN
    RAISE EXCEPTION 'Valid-plate error metric validation failed; no function was changed';
  END IF;

  EXECUTE v_definition;
END
$migration$;
