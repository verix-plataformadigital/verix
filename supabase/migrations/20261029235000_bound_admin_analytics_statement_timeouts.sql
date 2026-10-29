
-- Give the two Admin analytics RPCs enough time to complete their measured
-- workload, while keeping a finite ceiling below the Admin client's 15s abort.
ALTER FUNCTION public.verix2_admin_daily_trend_30d(timestamptz)
  SET statement_timeout TO '14s';

ALTER FUNCTION public.verix2_admin_insurance_delta_v1(
  timestamptz, timestamptz, timestamptz, timestamptz, timestamptz
) SET statement_timeout TO '14s';
