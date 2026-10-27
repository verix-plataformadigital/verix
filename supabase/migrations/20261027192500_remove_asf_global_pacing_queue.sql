-- Remove the temporary global ASF pacing queue.
-- It caused client requests to wait for up to 130 seconds and made clients
-- retry after timeouts while the original server-side request remained queued.
-- The ASF request itself is unchanged; the relay forwards each request directly.
DROP FUNCTION IF EXISTS public.verix_asf_reserve_slot(integer, integer);
DROP TABLE IF EXISTS public.verix_asf_pacing_state;
