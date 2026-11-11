-- The earlier 30-day error-category counter could miss a final outcome when
-- vehicle_insurance_error arrived before vehicle_lookup. The fixed ingestion
-- now preserves an allow-listed category in short-lived hashed dedupe state.
-- Since the category table is empty, mark its true reliable collection start.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.verix_daily_error_types) THEN
    UPDATE public.verix_daily_metrics_state
    SET error_types_since = clock_timestamp()
    WHERE singleton = true;
  END IF;
END
$$;
