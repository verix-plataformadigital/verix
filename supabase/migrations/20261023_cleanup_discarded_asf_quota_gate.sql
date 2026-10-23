-- Cleanup of an abandoned experimental per-minute ASF quota.
-- The production implementation uses verix_asf_serial_gate instead and does
-- not impose a local per-minute query-count limit.
DROP FUNCTION IF EXISTS public.verix_asf_release_slot(text, integer);
DROP FUNCTION IF EXISTS public.verix_asf_acquire_slot(text, integer, integer, integer);
DROP TABLE IF EXISTS public.verix_asf_request_log;
DROP TABLE IF EXISTS public.verix_asf_gate_state;
