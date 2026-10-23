-- The legacy cross-section analytics RPC is retained only for compatibility.
-- 64MB removed temp spills but increased measured execution to ~29s under the
-- current workload. Restore the previous 48MB setting; the live dashboard uses
-- the shared cached fast path instead.
ALTER FUNCTION public.verix2_admin_analytics(timestamptz)
  SET work_mem TO '48MB';
