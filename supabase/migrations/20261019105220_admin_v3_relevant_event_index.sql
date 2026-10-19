-- Narrow covering index for Admin V3's one-year activity scan.
-- The V3 compute query reads only these event types and only these columns from ev.
-- Keep raw telemetry unchanged; this is an additive index only.
CREATE INDEX IF NOT EXISTS verix2_events_admin_v3_relevant_idx
ON public.verix2_events (event, occurred_at DESC)
INCLUDE (installation_id, query_id)
WHERE event IN (
  'vehicle_lookup', 'vehicle_insurance_pending',
  'vehicle_insurance_yes', 'vehicle_insurance_no', 'vehicle_insurance_error',
  'imt_loaded', 'module_open', 'history_open', 'history_reopen',
  'external_tool_open', 'alcohol_lookup',
  'cinemometer_operation_start', 'cinemometer_speed_entry',
  'cinemometer_calculation', 'cinemometer_copy_code',
  'cinemometer_copy_text', 'cinemometer_copy_location',
  'cinemometer_profile_select', 'cinemometer_profile_new',
  'cinemometer_profile_duplicate', 'cinemometer_profile_delete',
  'cinemometer_profile_save', 'legislation_category_open',
  'legislation_search', 'legislation_copy', 'legislation_favorite_toggle'
);

