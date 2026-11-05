-- Refresh the compact dashboard snapshot every 15 minutes; the 30-day trend remains staggered at :07/:37.
SELECT cron.alter_job(job_id := 5, schedule := '*/15 * * * *', active := true);
