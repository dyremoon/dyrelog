-- Replaces the old "every new account waits for review" throttle with the
-- model DJ actually wants: a clean submission (no anti-cheat flags) posts
-- immediately regardless of account age, and the cost of getting flagged
-- falls on the *account*, not just that one fight. is_trusted (from
-- 0001_init.sql) is no longer read by decideStatus() — left in place
-- rather than dropped, since SQLite/D1 column drops are needless churn for
-- a column that's simply unused now.
--
-- is_restricted: starts false for everyone. Set true the moment any
-- submission from that account gets flagged (see submissions.js) — from
-- then on, *even a clean fight* from that account goes to pending_review
-- instead of auto-posting, until an admin explicitly restores the account
-- (see PATCH /api/admin/users/:id in index.js). This is what "loses their
-- privilege" means in practice.
ALTER TABLE users ADD COLUMN is_restricted INTEGER NOT NULL DEFAULT 0;

-- flag_reasons: the anti-cheat reason codes for a flagged submission
-- (JSON array as text, e.g. '["duplicate_content_hash"]'), persisted so
-- an admin reviewing later actually knows *why* something was flagged
-- instead of just seeing the bare status. Previously this only ever
-- existed in the one HTTP response at finalize time and was never saved
-- anywhere — a real gap once a review queue needs to show it.
ALTER TABLE submissions ADD COLUMN flag_reasons TEXT;
