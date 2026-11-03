-- Rate-limit cleanup is already performed by the successful daily
-- verix2_daily_cleanup cron job. Running this DELETE for every request caused
-- a full-table scan on every rate-limit check and is unnecessary: expired
-- windows are reset atomically for their own key below.
CREATE OR REPLACE FUNCTION public.verix2_consume_rate_limit(
  p_key text,
  p_limit integer DEFAULT 12,
  p_window_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_now timestamptz := now();
  v_started timestamptz;
  v_hits integer;
BEGIN
  INSERT INTO public.verix2_rate_limits(rate_key, window_started, hit_count)
  VALUES (p_key, v_now, 0)
  ON CONFLICT (rate_key) DO NOTHING;

  SELECT window_started, hit_count
    INTO v_started, v_hits
  FROM public.verix2_rate_limits
  WHERE rate_key = p_key
  FOR UPDATE;

  IF v_started <= v_now - make_interval(secs => greatest(1, p_window_seconds)) THEN
    UPDATE public.verix2_rate_limits
       SET window_started = v_now, hit_count = 1
     WHERE rate_key = p_key;
    RETURN true;
  END IF;

  IF v_hits >= greatest(1, p_limit) THEN
    RETURN false;
  END IF;

  UPDATE public.verix2_rate_limits
     SET hit_count = hit_count + 1
   WHERE rate_key = p_key;

  RETURN true;
END;
$function$;
