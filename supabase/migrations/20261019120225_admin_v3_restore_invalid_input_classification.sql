-- Restore the Admin-only distinction between malformed user plate input
-- and genuine technical failures, preserving the current optimized/historical function.
DO $migration$
DECLARE
  v_def text;
  v_old text;
  v_new text;
BEGIN
  v_def := pg_get_functiondef('public.verix2_admin_dashboard_v3_compute(timestamptz)'::regprocedure);

  IF position('error_candidate_rows AS MATERIALIZED' in v_def) > 0 THEN
    RAISE EXCEPTION 'Admin input-error classification is already present; refusing duplicate patch';
  END IF;

  v_old := $old$meta_ev AS MATERIALIZED (
  SELECT
    e.event_id, e.installation_id, e.query_id, e.event,
    e.occurred_at, e.metadata
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
    AND e.event IN ('vehicle_insurance_error', 'legislation_copy')
),
action_events AS MATERIALIZED ($old$;

  v_new := $new$meta_ev AS MATERIALIZED (
  SELECT
    e.event_id, e.installation_id, e.query_id, e.event,
    e.occurred_at, e.metadata
  FROM public.verix2_events e
  CROSS JOIN b
  WHERE e.occurred_at >= b.total_start
    AND e.occurred_at < b.report_end
    AND e.event IN ('vehicle_insurance_error', 'legislation_copy')
),
error_candidate_rows AS MATERIALIZED (
  SELECT
    e.event_id, e.query_id, e.installation_id, e.occurred_at,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfErrorType', ''),
      nullif(e.metadata->>'asfErrorType', ''),
      nullif(e.metadata->>'errorType', ''),
      'unknown'
    ) AS error_type,
    coalesce(
      nullif(e.metadata->'asfDiagnostic'->>'asfHttpStatus', ''),
      nullif(e.metadata->>'httpStatus', '')
    ) AS http_status_raw,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE public.verix2_admin_plate_format_valid(plate_candidate.value)
    ) AS has_valid_plate_format,
    EXISTS (
      SELECT 1
      FROM (VALUES
        (e.metadata->>'matriculaCapturada'),
        (e.metadata->'asfDiagnostic'->>'matricula'),
        (e.metadata->>'matriculaNormalizada'),
        (e.metadata->>'matricula')
      ) AS plate_candidate(value)
      WHERE regexp_replace(upper(coalesce(plate_candidate.value, '')), '[^A-Z0-9]', '', 'g') <> ''
    ) AS has_plate_input
  FROM meta_ev e
  WHERE e.event = 'vehicle_insurance_error'
),
error_classified AS MATERIALIZED (
  SELECT c.*,
    (
      c.error_type = 'http_400'
      AND c.http_status_raw = '400'
      AND c.has_plate_input
      AND NOT c.has_valid_plate_format
    ) AS user_input_invalid
  FROM error_candidate_rows c
),
error_input_by_query AS (
  SELECT query_id, bool_or(user_input_invalid) AS user_input_invalid
  FROM error_classified
  WHERE query_id IS NOT NULL
  GROUP BY query_id
),
action_events AS MATERIALIZED ($new$;

  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Admin function changed; could not find metadata CTE insertion point';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event
  FROM query_starts q
  LEFT JOIN query_finals f ON f.query_id = q.query_id
  LEFT JOIN query_pending p ON p.query_id = q.query_id
),
insurance_rows AS ($old$;
  v_new := $new$    CASE WHEN f.final_count = 1 THEN f.single_final_event ELSE NULL END AS final_event,
    CASE
      WHEN f.final_count = 1 AND f.single_final_event = 'vehicle_insurance_error'
        THEN coalesce(eq.user_input_invalid, false)
      ELSE false
    END AS user_input_invalid
  FROM query_starts q
  LEFT JOIN query_finals f ON f.query_id = q.query_id
  LEFT JOIN query_pending p ON p.query_id = q.query_id
  LEFT JOIN error_input_by_query eq ON eq.query_id = q.query_id
),
insurance_rows AS ($new$;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Admin function changed; could not find query quality insertion point';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_error') AS errors,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'pending') AS pending,$old$;
  v_new := $new$    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.final_event = 'vehicle_insurance_error' AND NOT q.user_input_invalid) AS errors,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'valid' AND q.user_input_invalid) AS user_input_invalid,
    count(q.query_id) FILTER (WHERE q.outcome_state = 'pending') AS pending,$new$;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Admin function changed; could not find error counter insertion point';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$error_event_rows AS (
  SELECT
    p.period,
    count(e.event_id) FILTER (WHERE e.event = 'vehicle_insurance_error') AS events,
    count(DISTINCT e.query_id) FILTER (WHERE e.event = 'vehicle_insurance_error' AND e.query_id IS NOT NULL) AS consultations,
    count(DISTINCT e.installation_id) FILTER (WHERE e.event = 'vehicle_insurance_error' AND e.installation_id IS NOT NULL) AS installations
  FROM periods p
  LEFT JOIN meta_ev e ON e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
  GROUP BY p.period
),$old$;
  v_new := $new$error_event_rows AS (
  SELECT
    p.period,
    count(e.event_id) FILTER (WHERE NOT e.user_input_invalid) AS events,
    count(DISTINCT e.query_id) FILTER (WHERE NOT e.user_input_invalid AND e.query_id IS NOT NULL) AS consultations,
    count(DISTINCT e.installation_id) FILTER (WHERE NOT e.user_input_invalid AND e.installation_id IS NOT NULL) AS installations,
    count(e.event_id) FILTER (WHERE e.user_input_invalid) AS user_input_invalid_events,
    count(DISTINCT e.query_id) FILTER (WHERE e.user_input_invalid AND e.query_id IS NOT NULL) AS user_input_invalid_consultations
  FROM periods p
  LEFT JOIN error_classified e ON e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
  GROUP BY p.period
),$new$;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Admin function changed; could not find raw-error aggregation point';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$  JOIN meta_ev e ON e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
  GROUP BY p.period, error_type$old$;
  v_new := $new$  JOIN meta_ev e ON e.event = 'vehicle_insurance_error'
    AND e.occurred_at >= p.start_at AND e.occurred_at < p.end_at
    AND NOT EXISTS (
      SELECT 1 FROM error_classified ec
      WHERE ec.event_id = e.event_id AND ec.user_input_invalid
    )
  GROUP BY p.period, error_type$new$;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Admin function changed; could not find error type exclusion point';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$      'errors', i.errors,
      'errorPct', CASE WHEN i.finals > 0 THEN round(100.0 * i.errors / i.finals, 1) ELSE NULL END,
      'errorEvents', coalesce(er.events, 0),
      'pending', i.pending,$old$;
  v_new := $new$      'errors', i.errors,
      'userInputInvalid', i.user_input_invalid,
      'errorPct', CASE WHEN i.finals - i.user_input_invalid > 0 THEN round(100.0 * i.errors / (i.finals - i.user_input_invalid), 1) ELSE NULL END,
      'errorEvents', coalesce(er.events, 0),
      'userInputInvalidEvents', coalesce(er.user_input_invalid_events, 0),
      'userInputInvalidConsultations', coalesce(er.user_input_invalid_consultations, 0),
      'pending', i.pending,$new$;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Admin function changed; could not find insurance JSON insertion point';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  v_old := $old$        'events', coalesce(er.events, 0),
        'consultations', coalesce(er.consultations, 0),
        'installations', coalesce(er.installations, 0),
        'topTypes', coalesce(et.top_types, '[]'::jsonb)$old$;
  v_new := $new$        'events', coalesce(er.events, 0),
        'consultations', coalesce(er.consultations, 0),
        'installations', coalesce(er.installations, 0),
        'userInputInvalidEvents', coalesce(er.user_input_invalid_events, 0),
        'userInputInvalidConsultations', coalesce(er.user_input_invalid_consultations, 0),
        'topTypes', coalesce(et.top_types, '[]'::jsonb)$new$;
  IF position(v_old in v_def) = 0 THEN
    RAISE EXCEPTION 'Admin function changed; could not find errors JSON insertion point';
  END IF;
  v_def := replace(v_def, v_old, v_new);

  EXECUTE v_def;

  IF position('error_candidate_rows AS MATERIALIZED' in pg_get_functiondef('public.verix2_admin_dashboard_v3_compute(timestamptz)'::regprocedure)) = 0
     OR position('userInputInvalidConsultations' in pg_get_functiondef('public.verix2_admin_dashboard_v3_compute(timestamptz)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Admin error classification failed post-deployment verification';
  END IF;
END;
$migration$;
