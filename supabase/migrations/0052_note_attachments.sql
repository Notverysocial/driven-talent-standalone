-- 0052_note_attachments.sql
--
-- File attachments on notes (applicant notes, and every other surface that
-- renders the shared CandidateNotes log — candidate, onboarding, employee).
-- Recruiters attach resumes, screenshots and ID documents to what they learn.
--
-- NUMBERED 0052, NOT 0051: 0051 is claimed by the RLS-lockdown draft (#88).
--
-- DESIGN
--   * Attach at the NOTE level, not the applicant level. A file is context for
--     something someone wrote at a moment in time, and doing it this way gives
--     every notes surface attachments for free.
--   * A PRIVATE bucket. These files include ID documents. The handbook upload
--     uses public Vercel Blob URLs, which is fine for a handbook and wrong here:
--     a public URL is readable by anyone holding the link, forever.
--   * No storage.objects policies at all. Upload, signing and delete happen
--     server-side with the service role. There is therefore NO anon or
--     authenticated path to the bytes except a short-lived signed URL minted
--     by the app after a must-exist check against this table.
--   * The metadata table is readable by `authenticated` ONLY — never `public`.
--     69 tables here are still open to the anon key pending #88; this one is
--     not born into that exposure. Writes go through the service role, so no
--     insert/update/delete policy is granted to any client role.
--
-- Additive and idempotent. Safe to re-run.

create table if not exists note_attachments (
  id                uuid primary key default gen_random_uuid(),
  note_id           uuid not null references candidate_notes(id) on delete cascade,
  bucket            text not null default 'note_attachments',
  storage_path      text not null unique,
  file_name         text not null,
  mime_type         text,
  size_bytes        bigint not null check (size_bytes >= 0),
  uploaded_by_id    uuid,
  uploaded_by_name  text not null,
  created_at        timestamptz not null default now()
);

create index if not exists note_attachments_note_id_idx on note_attachments (note_id);

alter table note_attachments enable row level security;

drop policy if exists "note_attachments_read_authenticated" on note_attachments;
create policy "note_attachments_read_authenticated"
  on note_attachments for select
  to authenticated
  using (true);

-- The bucket. Private, 25 MB per object to match the Server Action body limit
-- raised in #92, and restricted to documents and images.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'note_attachments',
  'note_attachments',
  false,
  26214400,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv', 'application/rtf',
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
