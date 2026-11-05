-- Dashboard snapshot every 30 minutes; 30-day trend once daily in off-peak hours.
SELECT cron.alter_job(job_id := 5, schedule := '*/30 * * * *', active := true);
SELECT cron.alter_job(job_id := 6, schedule := '17 4 * * *', active := true);
