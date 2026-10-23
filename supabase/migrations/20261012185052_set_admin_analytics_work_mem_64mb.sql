-- The heavy legacy analytics RPC spills large intermediate sorts and hashes
-- at 48 MB. 64 MB removed temp I/O in a same-SQL benchmark without changing
-- any returned metric. The main dashboard also uses this setting on cache misses.
ALTER FUNCTION public.verix2_admin_analytics(timestamptz)
  SET work_mem TO '64MB';

ALTER FUNCTION public.verix2_admin_dashboard_fast(timestamptz)
  SET work_mem TO '64MB';
