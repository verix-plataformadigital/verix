-- Global ASF serialization without an artificial per-minute quota.
-- Only the service-role Edge Function can call these RPCs.
CREATE TABLE IF NOT EXISTS public.verix_asf_serial_gate (
  id smallint PRIMARY KEY CHECK (id = 1),
  owner_token uuid,
  lease_until timestamptz,
  cooldown_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.verix_asf_serial_gate (id, owner_token, lease_until, cooldown_until)
VALUES (1, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.verix_asf_serial_gate ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix_asf_serial_gate FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.verix_asf_serial_gate TO service_role;

CREATE OR REPLACE FUNCTION public.verix_asf_try_acquire_slot(
  p_owner_token uuid,
  p_lease_seconds integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz;
  v_owner uuid;
  v_lease_until timestamptz;
  v_cooldown_until timestamptz;
  v_wait_ms integer;
  v_lease_seconds integer := greatest(20, least(coalesce(p_lease_seconds, 30), 60));
BEGIN
  IF p_owner_token IS NULL THEN
    RAISE EXCEPTION 'owner token is required';
  END IF;

  INSERT INTO public.verix_asf_serial_gate (id, owner_token, lease_until, cooldown_until)
  VALUES (1, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  SELECT owner_token, lease_until, cooldown_until
    INTO v_owner, v_lease_until, v_cooldown_until
  FROM public.verix_asf_serial_gate
  WHERE id = 1
  FOR UPDATE;

  v_now := clock_timestamp();

  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > v_now THEN
    v_wait_ms := greatest(100, ceil(extract(epoch FROM (v_cooldown_until - v_now)) * 1000)::integer);
    RETURN jsonb_build_object('granted', false, 'reason', 'upstream_retry_after', 'wait_ms', v_wait_ms);
  END IF;

  IF v_lease_until IS NOT NULL AND v_lease_until > v_now THEN
    v_wait_ms := greatest(100, ceil(extract(epoch FROM (v_lease_until - v_now)) * 1000)::integer);
    RETURN jsonb_build_object('granted', false, 'reason', 'busy', 'wait_ms', v_wait_ms);
  END IF;

  UPDATE public.verix_asf_serial_gate
  SET owner_token = p_owner_token,
      lease_until = v_now + make_interval(secs => v_lease_seconds::double precision),
      updated_at = v_now
  WHERE id = 1;

  RETURN jsonb_build_object('granted', true, 'reason', 'acquired', 'wait_ms', 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.verix_asf_release_slot(
  p_owner_token uuid,
  p_cooldown_ms integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_cooldown_ms integer := greatest(0, least(coalesce(p_cooldown_ms, 0), 300000));
  v_now timestamptz := clock_timestamp();
BEGIN
  UPDATE public.verix_asf_serial_gate
  SET owner_token = NULL,
      lease_until = NULL,
      cooldown_until = CASE
        WHEN v_cooldown_ms > 0 THEN
          greatest(
            coalesce(cooldown_until, '-infinity'::timestamptz),
            v_now + make_interval(secs => v_cooldown_ms::double precision / 1000.0)
          )
        ELSE cooldown_until
      END,
      updated_at = v_now
  WHERE id = 1
    AND owner_token = p_owner_token;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.verix_asf_try_acquire_slot(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verix_asf_release_slot(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_asf_try_acquire_slot(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.verix_asf_release_slot(uuid, integer) TO service_role;
