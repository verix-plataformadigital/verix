-- Global ASF pacing without a fixed per-minute rejection quota.
-- Requests wait their turn; the relay spaces upstream starts and honours upstream errors.
-- Rollback:
--   DROP FUNCTION IF EXISTS public.verix_asf_acquire_slot_v1(uuid, integer, integer);
--   DROP FUNCTION IF EXISTS public.verix_asf_release_slot_v1(uuid, integer);
--   DROP TABLE IF EXISTS public.verix_asf_pacing_gate_v1;

CREATE TABLE IF NOT EXISTS public.verix_asf_pacing_gate_v1 (
  id smallint PRIMARY KEY CHECK (id = 1),
  owner_token uuid,
  lease_until timestamptz,
  next_allowed_at timestamptz,
  cooldown_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.verix_asf_pacing_gate_v1
  (id, owner_token, lease_until, next_allowed_at, cooldown_until)
VALUES (1, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.verix_asf_pacing_gate_v1 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix_asf_pacing_gate_v1 FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.verix_asf_pacing_gate_v1 TO service_role;

CREATE OR REPLACE FUNCTION public.verix_asf_acquire_slot_v1(
  p_owner_token uuid,
  p_lease_seconds integer DEFAULT 30,
  p_min_interval_ms integer DEFAULT 10000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz;
  v_lease_until timestamptz;
  v_next_allowed_at timestamptz;
  v_cooldown_until timestamptz;
  v_block_until timestamptz;
  v_wait_ms integer;
  v_lease_seconds integer := greatest(20, least(coalesce(p_lease_seconds, 30), 60));
  v_min_interval_ms integer := greatest(1000, least(coalesce(p_min_interval_ms, 10000), 60000));
BEGIN
  IF p_owner_token IS NULL THEN
    RAISE EXCEPTION 'owner token is required';
  END IF;

  INSERT INTO public.verix_asf_pacing_gate_v1
    (id, owner_token, lease_until, next_allowed_at, cooldown_until)
  VALUES (1, NULL, NULL, NULL, NULL)
  ON CONFLICT (id) DO NOTHING;

  SELECT lease_until, next_allowed_at, cooldown_until
    INTO v_lease_until, v_next_allowed_at, v_cooldown_until
  FROM public.verix_asf_pacing_gate_v1
  WHERE id = 1
  FOR UPDATE;

  v_now := clock_timestamp();
  v_block_until := greatest(
    coalesce(v_lease_until, '-infinity'::timestamptz),
    coalesce(v_next_allowed_at, '-infinity'::timestamptz),
    coalesce(v_cooldown_until, '-infinity'::timestamptz)
  );

  IF v_block_until > v_now THEN
    v_wait_ms := greatest(
      100,
      ceil(extract(epoch FROM (v_block_until - v_now)) * 1000)::integer
    );
    RETURN jsonb_build_object(
      'granted', false,
      'reason', CASE
        WHEN v_cooldown_until IS NOT NULL AND v_cooldown_until > v_now THEN 'upstream_cooldown'
        WHEN v_lease_until IS NOT NULL AND v_lease_until > v_now THEN 'busy'
        ELSE 'minimum_interval'
      END,
      'wait_ms', v_wait_ms
    );
  END IF;

  UPDATE public.verix_asf_pacing_gate_v1
  SET owner_token = p_owner_token,
      lease_until = v_now + make_interval(secs => v_lease_seconds::double precision),
      next_allowed_at = v_now + make_interval(secs => v_min_interval_ms::double precision / 1000.0),
      updated_at = v_now
  WHERE id = 1;

  RETURN jsonb_build_object('granted', true, 'reason', 'acquired', 'wait_ms', 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.verix_asf_release_slot_v1(
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
  UPDATE public.verix_asf_pacing_gate_v1
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

REVOKE ALL ON FUNCTION public.verix_asf_acquire_slot_v1(uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.verix_asf_release_slot_v1(uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_asf_acquire_slot_v1(uuid, integer, integer)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.verix_asf_release_slot_v1(uuid, integer)
  TO service_role;
