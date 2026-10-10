-- Store the most recently observed client IP for administrator-only diagnostics.
-- The IP is sourced from trusted proxy headers at the Edge Function, never from
-- client-supplied telemetry fields.
ALTER TABLE public.verix2_installations
  ADD COLUMN IF NOT EXISTS client_ip text;

COMMENT ON COLUMN public.verix2_installations.client_ip IS
  'Most recently observed client IP from the telemetry edge request; available to the authenticated admin dashboard only. It identifies the network address, not necessarily one person.';

DO $migration$
DECLARE
  v_ingest text;
  v_analytics text;
  v_old_cols text := $old$
      browser,
      os
    )
    SELECT
      payload.installation_id,
      payload.first_seen,
      LEAST(payload.last_seen, now() - interval '11 minutes'),
      payload.app_version,
      payload.device_type,
      payload.browser,
      payload.os
    FROM jsonb_to_recordset(p_installations) AS payload(
      installation_id text,
      first_seen timestamptz,
      last_seen timestamptz,
      app_version text,
      device_type text,
      browser text,
      os text
    )
    ON CONFLICT (installation_id) DO UPDATE SET
      first_seen = LEAST(current_installation.first_seen, EXCLUDED.first_seen),
      app_version = COALESCE(EXCLUDED.app_version, current_installation.app_version),
      device_type = COALESCE(EXCLUDED.device_type, current_installation.device_type),
      browser = COALESCE(EXCLUDED.browser, current_installation.browser),
      os = COALESCE(EXCLUDED.os, current_installation.os);
$old$;
  v_new_cols text := $new$
      browser,
      os,
      client_ip
    )
    SELECT
      payload.installation_id,
      payload.first_seen,
      LEAST(payload.last_seen, now() - interval '11 minutes'),
      payload.app_version,
      payload.device_type,
      payload.browser,
      payload.os,
      payload.client_ip
    FROM jsonb_to_recordset(p_installations) AS payload(
      installation_id text,
      first_seen timestamptz,
      last_seen timestamptz,
      app_version text,
      device_type text,
      browser text,
      os text,
      client_ip text
    )
    ON CONFLICT (installation_id) DO UPDATE SET
      first_seen = LEAST(current_installation.first_seen, EXCLUDED.first_seen),
      app_version = COALESCE(EXCLUDED.app_version, current_installation.app_version),
      device_type = COALESCE(EXCLUDED.device_type, current_installation.device_type),
      browser = COALESCE(EXCLUDED.browser, current_installation.browser),
      os = COALESCE(EXCLUDED.os, current_installation.os),
      client_ip = COALESCE(EXCLUDED.client_ip, current_installation.client_ip);
$new$;
  v_old_errors text := $old_errors$
err_installs AS (
  SELECT installation_id,count(DISTINCT query_id) qty,count(*) event_qty,count(DISTINCT query_id) queries,max(occurred_at) last_at
  FROM ev,b WHERE event='vehicle_insurance_error' AND occurred_at>=b.s24 AND query_id IS NOT NULL
  GROUP BY 1 ORDER BY qty DESC,last_at DESC LIMIT 15
),
$old_errors$;
  v_new_errors text := $new_errors$
err_installs AS (
  SELECT e.installation_id,
         max(i.client_ip) AS client_ip,
         count(DISTINCT e.query_id) qty,
         count(*) event_qty,
         count(DISTINCT e.query_id) queries,
         max(e.occurred_at) last_at
  FROM ev e
  CROSS JOIN b
  LEFT JOIN public.verix2_installations i
    ON i.installation_id=e.installation_id
  WHERE e.event='vehicle_insurance_error'
    AND e.occurred_at>=b.s24
    AND e.query_id IS NOT NULL
  GROUP BY e.installation_id
  ORDER BY qty DESC,last_at DESC LIMIT 15
),
$new_errors$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_ingest_telemetry(jsonb,jsonb,jsonb)'::regprocedure)
    INTO v_ingest;
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamp with time zone)'::regprocedure)
    INTO v_analytics;

  IF position(v_old_cols IN v_ingest)=0
     OR position(v_old_errors IN v_analytics)=0 THEN
    RAISE EXCEPTION 'Expected telemetry function definitions not found; no function changes applied';
  END IF;

  v_ingest := replace(v_ingest, v_old_cols, v_new_cols);
  v_analytics := replace(v_analytics, v_old_errors, v_new_errors);

  IF position('client_ip text' IN v_ingest)=0
     OR position('client_ip = COALESCE(EXCLUDED.client_ip, current_installation.client_ip)' IN v_ingest)=0
     OR position('max(i.client_ip) AS client_ip' IN v_analytics)=0 THEN
    RAISE EXCEPTION 'IP integration validation failed; no changes applied';
  END IF;

  EXECUTE v_ingest;
  EXECUTE v_analytics;
END
$migration$;
