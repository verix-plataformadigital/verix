create extension if not exists pg_cron with schema extensions;

do $outer$
begin
  if not exists (select 1 from cron.job where jobname='verix2_daily_cleanup') then
    perform cron.schedule(
      'verix2_daily_cleanup',
      '20 3 * * *',
      $job$select public.verix2_cleanup_old_data();$job$
    );
  end if;
end
$outer$;
