-- Keep separate browser/Windows sessions visible even when they share one SIM
-- and public IP. Never expose the random session ID in the admin interface:
-- use a readable local-time session start label instead.
DO $migration$
DECLARE
  v_definition text;
  v_old text := $old$
err_installs AS (
  SELECT coalesce(i.client_ip, 'IP não recolhido · ' || left(e.installation_id, 8)) AS client_ip,
         count(DISTINCT e.installation_id) AS installations,
         count(DISTINCT e.query_id) AS qty,
         count(*) AS event_qty,
         max(e.occurred_at) AS last_at
  FROM ev e
  CROSS JOIN b
  LEFT JOIN public.verix2_installations i
    ON i.installation_id=e.installation_id
  WHERE e.event='vehicle_insurance_error'
    AND e.occurred_at>=b.s24
    AND e.query_id IS NOT NULL
  GROUP BY coalesce(i.client_ip, 'IP não recolhido · ' || left(e.installation_id, 8))
  ORDER BY qty DESC,last_at DESC LIMIT 15
),
$old$;
  v_new text := $new$
err_installs AS (
  SELECT coalesce(i.client_ip, 'IP não recolhido') AS client_ip,
         CASE
           WHEN e.session_id IS NOT NULL
             THEN 'Sessão · ' || to_char(min(s.started_at) AT TIME ZONE 'Europe/Lisbon', 'DD/MM HH24:MI:SS')
           ELSE 'Sessão sem ID · ' || to_char(min(e.occurred_at) AT TIME ZONE 'Europe/Lisbon', 'DD/MM HH24:MI:SS')
         END AS session_label,
         count(DISTINCT e.installation_id) AS installations,
         count(DISTINCT e.query_id) AS qty,
         count(*) AS event_qty,
         max(e.occurred_at) AS last_at,
         max(s.last_seen) AS session_last_seen
  FROM ev e
  CROSS JOIN b
  LEFT JOIN public.verix2_installations i
    ON i.installation_id=e.installation_id
  LEFT JOIN public.verix2_sessions s
    ON s.session_id=e.session_id
  WHERE e.event='vehicle_insurance_error'
    AND e.occurred_at>=b.s24
    AND e.query_id IS NOT NULL
  GROUP BY coalesce(i.client_ip, 'IP não recolhido'),
           coalesce(e.session_id, 'no-session:' || e.installation_id),
           e.session_id IS NOT NULL
  ORDER BY qty DESC,last_at DESC LIMIT 15
),
$new$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamp with time zone)'::regprocedure)
    INTO v_definition;

  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected IP aggregation block not found; no changes applied';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  IF position('AS session_label' IN v_definition)=0
     OR position('AS session_last_seen' IN v_definition)=0
     OR position('no-session:' IN v_definition)=0 THEN
    RAISE EXCEPTION 'IP + session grouping validation failed; no changes applied';
  END IF;

  EXECUTE v_definition;
END
$migration$;
