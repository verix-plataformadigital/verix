-- Global pacing for all VÉRIX insurance lookups through the shared Supabase relay.
-- This is a queue, not a per-installation or per-minute rejection quota.
CREATE TABLE IF NOT EXISTS public.verix_asf_pacing_state (
  id smallint PRIMARY KEY CHECK (id = 1),
  next_slot_at timestamptz NOT NULL DEFAULT '-infinity'::timestamptz,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.verix_asf_pacing_state (id, next_slot_at, updated_at)
VALUES (1, '-infinity'::timestamptz, clock_timestamp())
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.verix_asf_pacing_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.verix_asf_pacing_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.verix_asf_pacing_state TO service_role;

CREATE OR REPLACE FUNCTION public.verix_asf_reserve_slot(
  p_interval_ms integer DEFAULT 12200,
  p_max_wait_ms integer DEFAULT 130000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_now timestamptz;
  v_next_slot_at timestamptz;
  v_scheduled_at timestamptz;
  v_wait_ms integer;
  v_interval_ms integer := greatest(12200, least(coalesce(p_interval_ms, 12200), 30000));
  v_max_wait_ms integer := greatest(5000, least(coalesce(p_max_wait_ms, 130000), 130000));
BEGIN
  INSERT INTO public.verix_asf_pacing_state (id, next_slot_at, updated_at)
  VALUES (1, '-infinity'::timestamptz, clock_timestamp())
  ON CONFLICT (id) DO NOTHING;

  SELECT next_slot_at
    INTO v_next_slot_at
  FROM public.verix_asf_pacing_state
  WHERE id = 1
  FOR UPDATE;

  v_now := clock_timestamp();
  v_scheduled_at := greatest(v_now, coalesce(v_next_slot_at, '-infinity'::timestamptz));
  v_wait_ms := greatest(
    0,
    ceil(extract(epoch FROM (v_scheduled_at - v_now)) * 1000)::integer
  );

  IF v_wait_ms > v_max_wait_ms THEN
    RETURN jsonb_build_object(
      'granted', false,
      'wait_ms', v_wait_ms,
      'interval_ms', v_interval_ms
    );
  END IF;

  UPDATE public.verix_asf_pacing_state
  SET next_slot_at = v_scheduled_at + (v_interval_ms * interval '1 millisecond'),
      updated_at = v_now
  WHERE id = 1;

  RETURN jsonb_build_object(
    'granted', true,
    'wait_ms', v_wait_ms,
    'interval_ms', v_interval_ms
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.verix_asf_reserve_slot(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verix_asf_reserve_slot(integer, integer) TO service_role;
