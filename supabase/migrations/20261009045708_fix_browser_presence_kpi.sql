-- Count open VÉRIX browser sessions, not installations with any recent event.
-- session_close gives pagehide a chance to remove a tab immediately. A 90-second
-- heartbeat lease remains as a fallback if the browser crashes or cannot send close.
DO $migration$
DECLARE
  original_definition text;
  updated_definition text;
  old_expression text := $old$
    'online_now',(SELECT count(DISTINCT installation_id) FROM (
      SELECT installation_id FROM public.verix2_installations WHERE last_seen >= p_now-interval '5 minutes'
      UNION SELECT installation_id FROM public.verix2_sessions WHERE last_seen >= p_now-interval '5 minutes'
      UNION SELECT installation_id FROM ev WHERE occurred_at >= p_now-interval '5 minutes'
    ) active5),
$old$;
  new_expression text := $new$
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
$new$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
    INTO original_definition;

  IF original_definition IS NULL THEN
    RAISE EXCEPTION 'verix2_admin_analytics(timestamptz) not found';
  END IF;

  updated_definition := replace(original_definition, old_expression, new_expression);
  IF updated_definition = original_definition THEN
    RAISE EXCEPTION 'Could not find the existing online_now expression; migration stopped without changes';
  END IF;

  EXECUTE updated_definition;
END
$migration$;
