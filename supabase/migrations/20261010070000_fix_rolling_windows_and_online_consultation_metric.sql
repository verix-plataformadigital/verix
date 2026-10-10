-- Make the admin's 24-hour window a true rolling window and define
-- "Online agora" by recent consultations, not passive browser heartbeats.
DO $migration$
DECLARE
  v_definition text;
  v_old_window text := $old_window$
    greatest(
      p_now - interval '24 hours',
      coalesce((SELECT reset_24h_at FROM public.verix2_dashboard_state WHERE singleton=true),
               '1970-01-01T00:00:00Z'::timestamptz)
    ) AS s24,
$old_window$;
  v_new_window text := $new_window$
    p_now - interval '24 hours' AS s24,
$new_window$;
  v_old_online text := $old_online$
    'online_now',(SELECT count(*) FROM (
      SELECT session_id,
             max(occurred_at) FILTER (WHERE event IN ('app_open','heartbeat')) AS last_presence,
             max(occurred_at) FILTER (WHERE event='session_close') AS last_close
      FROM public.verix2_events
      WHERE session_id IS NOT NULL
        AND event IN ('app_open','heartbeat','session_close')
        AND occurred_at >= p_now-interval '2 minutes'
        AND occurred_at <= p_now+interval '30 seconds'
      GROUP BY session_id
    ) presence
    WHERE last_presence >= p_now-interval '90 seconds'
      AND (last_close IS NULL OR last_presence > last_close)),
$old_online$;
  v_new_online text := $new_online$
    'online_now',(SELECT count(DISTINCT installation_id)
      FROM public.verix2_events
      WHERE event='vehicle_lookup'
        AND occurred_at >= p_now-interval '3 minutes'
        AND occurred_at <= p_now),
$new_online$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
    INTO v_definition;

  IF position(v_old_window IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected reset-clamped 24h expression not found; refusing partial patch';
  END IF;
  IF position(v_old_online IN v_definition)=0 THEN
    RAISE EXCEPTION 'Expected browser-heartbeat online expression not found; refusing partial patch';
  END IF;

  v_definition := replace(v_definition, v_old_window, v_new_window);
  v_definition := replace(v_definition, v_old_online, v_new_online);
  EXECUTE v_definition;
END
$migration$;
