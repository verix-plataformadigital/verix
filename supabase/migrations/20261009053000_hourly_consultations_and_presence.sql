-- Hourly usage: count actual insurance lookups and distinct installations with
-- presence activity, and include empty hours so the full 24-hour day is visible.
DO $migration$
DECLARE
  original_definition text;
  updated_definition text;
  old_hourly text := $old$
hourly AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.hour_num),'[]'::jsonb) data
  FROM(
    SELECT extract(hour FROM occurred_at AT TIME ZONE 'Europe/Lisbon')::int hour_num,
           count(*) FILTER(WHERE event<>'heartbeat') actions,
           count(DISTINCT installation_id) users
    FROM ev,b WHERE occurred_at>=b.s24 GROUP BY 1 ORDER BY actions DESC,hour_num
  ) x
),
$old$;
  new_hourly text := $new$
hourly AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.hour_num),'[]'::jsonb) data
  FROM (
    SELECT h.hour_num,
           coalesce(c.consultations,0) AS consultations,
           coalesce(c.consultations,0) AS actions,
           coalesce(p.users,0) AS users,
           coalesce(p.sessions,0) AS sessions
    FROM generate_series(0,23) AS h(hour_num)
    LEFT JOIN (
      SELECT extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Lisbon')::int hour_num,
             count(DISTINCT e.query_id) FILTER (
               WHERE e.event='vehicle_lookup' AND e.query_id IS NOT NULL
             ) AS consultations
      FROM ev e,b
      WHERE e.occurred_at>=b.s24
      GROUP BY 1
    ) c ON c.hour_num=h.hour_num
    LEFT JOIN (
      SELECT extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Lisbon')::int hour_num,
             count(DISTINCT e.installation_id) FILTER (
               WHERE e.event IN ('app_open','heartbeat')
             ) AS users,
             count(DISTINCT e.session_id) FILTER (
               WHERE e.event IN ('app_open','heartbeat') AND e.session_id IS NOT NULL
             ) AS sessions
      FROM ev e,b
      WHERE e.occurred_at>=b.s24
      GROUP BY 1
    ) p ON p.hour_num=h.hour_num
    ORDER BY h.hour_num
  ) x
),
$new$;
BEGIN
  SELECT pg_get_functiondef('public.verix2_admin_analytics(timestamptz)'::regprocedure)
    INTO original_definition;

  IF original_definition IS NULL THEN
    RAISE EXCEPTION 'verix2_admin_analytics(timestamptz) not found';
  END IF;

  updated_definition := replace(original_definition, old_hourly, new_hourly);
  IF updated_definition = original_definition THEN
    RAISE EXCEPTION 'Could not find the existing hourly CTE; migration stopped without changes';
  END IF;

  EXECUTE updated_definition;
END
$migration$;
