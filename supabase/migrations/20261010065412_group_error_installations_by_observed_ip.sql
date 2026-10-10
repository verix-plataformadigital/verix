-- Aggregate the error-installation diagnostic list by observed IP, not by
-- opaque browser-generated installation IDs. This is a network-level identity,
-- not proof of a unique human user.
DO $migration$
DECLARE
  v_definition text;
  v_old text := $old$
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
$old$;
  v_new text := $new$
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
$new$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamp with time zone)'::regprocedure)
    INTO v_definition;

  IF position(v_old IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected error-installation aggregation block not found; no changes applied';
  END IF;

  v_definition := replace(v_definition, v_old, v_new);
  IF position('AS installations' IN v_definition)=0
     OR position('AS client_ip' IN v_definition)=0 THEN
    RAISE EXCEPTION 'IP grouping validation failed; no changes applied';
  END IF;

  EXECUTE v_definition;
END
$migration$;
