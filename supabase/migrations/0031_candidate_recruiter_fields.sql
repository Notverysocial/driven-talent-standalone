-- 0031_candidate_recruiter_fields.sql
--
-- Module #14 — Recruiter candidate tabs.
--
-- The per-recruiter tabs (Estefany, Priscila, Rodrigo, Nathalia, Leangel)
-- reuse the existing `candidates` table (which already has `recruiter` and
-- `notes`). They additionally need to:
--   * attach a candidate photo  -> photo_url  (public URL in candidate_photos)
--   * track whether the candidate responded to outreach -> responded (boolean)
--
-- Also provisions a PUBLIC `candidate_photos` storage bucket + an open policy,
-- mirroring the resumes / invoice_pdfs buckets in 0000_init.sql. Public so the
-- uploaded headshot renders directly via getPublicUrl (no signing round-trip).
--
-- Additive + idempotent — existing rows untouched; safe to re-run.

alter table candidates
  add column if not exists photo_url text,
  add column if not exists responded boolean not null default false;

-- Quick lookup for the recruiter tabs (filtered by the free-text recruiter).
create index if not exists candidates_recruiter_idx
  on candidates (recruiter) where recruiter is not null;

-- ---------- storage: candidate_photos bucket ----------------------------

insert into storage.buckets (id, name, public)
  values ('candidate_photos', 'candidate_photos', true)
  on conflict (id) do nothing;

drop policy if exists "candidate_photos open" on storage.objects;
create policy "candidate_photos open" on storage.objects for all to public
  using (bucket_id = 'candidate_photos') with check (bucket_id = 'candidate_photos');
