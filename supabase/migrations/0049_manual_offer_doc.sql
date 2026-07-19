-- 0049_manual_offer_doc.sql
--
-- Manual fallback for the onboarding offer document.
--
-- WHY: PandaDoc is `status='disconnected'` with null tokens in production, but
-- the "Send onboarding doc" button still rendered for any candidate at the
-- offer stage and fired into a dead integration, returning an unexplained
-- error. Onboarding should not be blocked while OAuth waits on a meeting, so a
-- recruiter can record that the offer was sent out-of-band (email, in person)
-- and attach the signed copy.
--
-- STRICTLY ADDITIVE AND REVERSIBLE. Nothing existing is dropped or rewritten;
-- the PandaDoc columns (pandadoc_document_id / pandadoc_document_status) are
-- untouched and resume working the moment PandaDoc is reconnected.
-- Reverse with: alter table candidates drop column offer_doc_manual_sent_at,
--   drop column offer_doc_manual_sent_by, drop column offer_doc_signed_path;
--   delete from storage.buckets where id = 'onboarding_docs';
--
-- Numbered 0049 — 0047 (markup) and 0048 (bug intake) are claimed by other lanes.

alter table candidates
  add column if not exists offer_doc_manual_sent_at  timestamptz,
  add column if not exists offer_doc_manual_sent_by  text,
  add column if not exists offer_doc_signed_path     text;

-- Private bucket for counter-signed offer documents. Private (not public) because
-- these are signed employment documents; the app serves them via a short-lived
-- signed URL, the same pattern as `resumes`.
insert into storage.buckets (id, name, public)
  values ('onboarding_docs', 'onboarding_docs', false)
  on conflict (id) do nothing;

drop policy if exists "onboarding_docs open" on storage.objects;
create policy "onboarding_docs open" on storage.objects for all to public
  using (bucket_id = 'onboarding_docs') with check (bucket_id = 'onboarding_docs');
