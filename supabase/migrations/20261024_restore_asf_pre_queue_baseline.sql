-- Restore the historical pre-queue ASF relay architecture.
-- The v25 asf-proxy-v1 no longer calls these RPCs. Preserve historical migration
-- records and telemetry tables; remove only the queue objects introduced on 2026-10-23.
DROP FUNCTION IF EXISTS public.verix_asf_try_acquire_slot(uuid, integer);
DROP FUNCTION IF EXISTS public.verix_asf_release_slot(uuid, integer);
DROP TABLE IF EXISTS public.verix_asf_serial_gate;
