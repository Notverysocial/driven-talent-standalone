-- Driven Talent — storage bucket for public bug/feedback intake screenshots
--
-- Backs the public form at /report (src/app/api/report/submit/route.ts).
--
-- NO TABLE CHANGES. `bug_reports` already has the `attachment_path` column
-- (migration 0014) which was written as a forward-compatible pointer for
-- exactly this. This migration only provisions the bucket that column points
-- into, so the existing rows reading
--   "[screenshot attached at submission time but storage is not yet
--    provisioned]"
-- stop being a thing that happens.
--
-- Additive and idempotent — safe to re-run.
--
-- Numbered 0048, not 0047: the per-employee markup lane claimed 0047 in
-- parallel on the same working tree and keeps it, being reported first and
-- touching billing. This migration has no ordering dependency on 0047 — it
-- creates a storage bucket and touches no table — so the two can be applied
-- in either order.
--
-- ---------------------------------------------------------------------------
-- BEHAVIOUR BEFORE THIS IS APPLIED
--
-- Migrations are not auto-applied in this project, so the app code ships
-- first. That is handled explicitly: /report probes for this bucket on render
-- and, when it is missing, does NOT render a file input and tells the reporter
-- in plain language that screenshots are not accepted yet. The submit endpoint
-- likewise refuses (502) a submission carrying a file it cannot store rather
-- than accepting it and dropping the bytes. Applying this migration is what
-- switches attachments on; nothing breaks until then, and nothing is lost.
-- ---------------------------------------------------------------------------

-- ---------- storage: bug_attachments bucket -------------------------------

-- PRIVATE (public => false), unlike candidate_photos. Screenshots of the ops
-- app routinely contain employee names, wages, and timecard detail, so the
-- objects must not be world-readable by URL. Triagers reach them through
-- /api/bug-reports/attachment, which requires a signed-in user and mints a
-- 5-minute signed URL with the service role.
insert into storage.buckets (id, name, public)
  values ('bug_attachments', 'bug_attachments', false)
  on conflict (id) do nothing;

-- Anonymous INSERT only. The public form uploads with the anon key (same
-- client the rest of the app uses), so it needs to write. It must never be
-- able to read or list what other reporters uploaded, which is why this is
-- `for insert` and not the blanket `for all` "open" policy used by
-- candidate_photos in 0031.
drop policy if exists "bug_attachments public insert" on storage.objects;
create policy "bug_attachments public insert" on storage.objects
  for insert to public
  with check (bucket_id = 'bug_attachments');

-- Signed-in staff can read. Reads by the service role bypass RLS entirely, so
-- this exists for any direct-from-session access (and keeps the bucket usable
-- if the signed-URL route is ever swapped for a client-side call).
drop policy if exists "bug_attachments staff read" on storage.objects;
create policy "bug_attachments staff read" on storage.objects
  for select to authenticated
  using (bucket_id = 'bug_attachments');

-- Deliberately NO public update/delete policy: a submitter must not be able to
-- overwrite or remove an attachment after filing. The submit endpoint's
-- cleanup path (orphan removal when the row insert fails) runs before the
-- response and is best-effort; if it is ever needed reliably, do it from a
-- service-role job, not by widening this.
