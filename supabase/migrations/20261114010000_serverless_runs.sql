-- Runs can be executed by a later request (serverless hosts such as Vercel): the saved work to do, and when a
-- server instance claimed it so it never runs twice.
alter table runs add column if not exists job_json text;
alter table runs add column if not exists claimed_at text;
