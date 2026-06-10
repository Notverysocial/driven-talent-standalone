-- PandaDoc integration: track the onboarding-offer document we sent for
-- each candidate so the webhook + sync can map document status changes
-- back to the candidate row.
--
-- pandadoc_document_id     = PandaDoc's document UUID (returned by /documents).
-- pandadoc_document_status = the last status string we saw from PandaDoc,
--                            e.g. "document.draft", "document.sent",
--                            "document.viewed", "document.completed",
--                            "document.declined".

alter table candidates
  add column if not exists pandadoc_document_id text,
  add column if not exists pandadoc_document_status text;

create index if not exists idx_candidates_pandadoc_document_id
  on candidates(pandadoc_document_id)
  where pandadoc_document_id is not null;
