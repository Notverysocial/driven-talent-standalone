-- 0051_rls_lockdown.sql
--
-- ############################################################################
-- ##  DRAFT — DO NOT APPLY WITHOUT ANTONIO'S EXPLICIT GO.                    ##
-- ##  Drafted 2026-09-10. Verified against production, but NOT executed.     ##
-- ############################################################################
--
-- WHAT THIS FIXES
--
-- 69 policies across the schema are `for all to public using (true) with
-- check (true)`. `public` in Postgres includes the `anon` role, and the anon
-- key is NOT a secret here: it is published in the JavaScript bundle of
-- driven-talent.com (two chunks contain it verbatim, confirmed 2026-09-10)
-- because src/components/ChatWidget.tsx is a client component that reads
-- NEXT_PUBLIC_SUPABASE_ANON_KEY.
--
-- Measured with that published key against production on 2026-09-10, with no
-- login of any kind:
--
--     employees        89 rows      candidates      129 rows
--     timecards       826 rows      contacts        143 rows
--     conversations   141 rows      messages        167 rows
--     do_not_return    32 rows      client_contacts  39 rows
--
--   plus object listings for the `resumes` and `candidate_photos` storage
--   buckets, both of which config.toml declares private.
--
-- `with check (true)` means the same key can almost certainly WRITE these
-- tables as well. That was deliberately NOT tested against production.
--
-- The single table with correct RLS today is `profiles` (migration 0017),
-- which scopes to `authenticated`. This migration extends that posture to
-- everything else.
--
-- WHY `authenticated` IS THE RIGHT TARGET
--
-- Every app data path is server-side and arrives as one of two identities:
--   * the signed-in user's JWT, whose `role` claim is `authenticated`
--     (verified by decoding a live session token), used by createClient()
--     in src/lib/supabase/server.ts; or
--   * the service-role key, which bypasses RLS entirely, used by
--     createServiceClient() for crons, webhooks, the intake API and the
--     integrations layer.
-- Neither is affected by removing the `anon` grant.
--
-- THE FOUR TABLES THAT GENUINELY NEED ANON, AND WHY
--
--   bug_reports    Two PUBLIC endpoints insert here with the anon client, by
--                  design, for people who are not (or cannot be) signed in:
--                  /api/report/submit and /api/build-direct/submit. Both say
--                  so in their own headers. They INSERT only — so anon keeps
--                  insert and LOSES the select/update/delete it has today.
--
--   contacts       The public ChatWidget on driven-talent.com talks to these
--   conversations  three tables directly from the browser with the anon key.
--   messages       Locking them out would break the live site chat.
--
--                  Insert-only is NOT sufficient for the widget: it reads its
--                  own thread back and subscribes to realtime. A correct fix
--                  scopes reads to the visitor's own conversation, which the
--                  current schema cannot express (there is no per-visitor
--                  token on the row). SEE THE FOLLOW-UP BELOW — this migration
--                  deliberately does NOT pretend to solve it, because a policy
--                  that looks tight and is not is worse than one that is
--                  honestly still open.
--
-- FOLLOW-UP REQUIRED (not in this file)
--   1. Move the ChatWidget behind a server route on the site that uses the
--      service-role key, exactly as /api/contact and /api/schedule-call
--      already do in that repo. Then these three tables can drop to
--      `authenticated` too and the anon grant disappears entirely.
--   2. Only after (1): rotate the anon key. Rotating it BEFORE (1) breaks
--      the public site, and rotating it at all requires redeploying both
--      Vercel projects with the new value.
--
-- ORDER OF OPERATIONS WHEN THIS IS APPLIED
--   Apply this file FIRST and watch the app, because migrations here are
--   applied by hand and are not coupled to a deploy. Nothing in the app code
--   needs to change for it. If something breaks it will be a path that was
--   silently relying on anon, and the fix is to identify that path, not to
--   revert to `to public`.

begin;

-- activity_log
drop policy if exists "open" on activity_log;
create policy "activity_log_authenticated" on activity_log for all to authenticated using (true) with check (true);

-- application_intakes
drop policy if exists "open" on application_intakes;
create policy "application_intakes_authenticated" on application_intakes for all to authenticated using (true) with check (true);

-- attendance_entries
drop policy if exists "open" on attendance_entries;
create policy "attendance_entries_authenticated" on attendance_entries for all to authenticated using (true) with check (true);

-- bonuses
drop policy if exists "open" on bonuses;
create policy "bonuses_authenticated" on bonuses for all to authenticated using (true) with check (true);

-- bug_reports
drop policy if exists "open" on bug_reports;
create policy "bug_reports_authenticated" on bug_reports for all to authenticated using (true) with check (true);
-- Public bug intake: insert only. anon loses the read/update/delete it had.
create policy "bug_reports_anon_insert" on bug_reports for insert to anon with check (true);

-- calendar_events
drop policy if exists "open" on calendar_events;
create policy "calendar_events_authenticated" on calendar_events for all to authenticated using (true) with check (true);

-- candidate_notes
drop policy if exists "open" on candidate_notes;
create policy "candidate_notes_authenticated" on candidate_notes for all to authenticated using (true) with check (true);

-- candidates
drop policy if exists "open" on candidates;
create policy "candidates_authenticated" on candidates for all to authenticated using (true) with check (true);

-- client_contacts
drop policy if exists "open" on client_contacts;
create policy "client_contacts_authenticated" on client_contacts for all to authenticated using (true) with check (true);

-- client_workers_comp_codes
drop policy if exists "open" on client_workers_comp_codes;
create policy "client_workers_comp_codes_authenticated" on client_workers_comp_codes for all to authenticated using (true) with check (true);

-- clients
drop policy if exists "open" on clients;
create policy "clients_authenticated" on clients for all to authenticated using (true) with check (true);

-- company_settings
drop policy if exists "open" on company_settings;
create policy "company_settings_authenticated" on company_settings for all to authenticated using (true) with check (true);

-- contacts
drop policy if exists "open" on contacts;
create policy "contacts_authenticated" on contacts for all to authenticated using (true) with check (true);
-- STILL OPEN TO anon: required by the public ChatWidget on driven-talent.com.
-- Tighten only after that widget moves behind a service-role server route.
create policy "contacts_anon_chat_widget" on contacts for all to anon using (true) with check (true);

-- conversations
drop policy if exists "open" on conversations;
create policy "conversations_authenticated" on conversations for all to authenticated using (true) with check (true);
-- STILL OPEN TO anon: required by the public ChatWidget on driven-talent.com.
-- Tighten only after that widget moves behind a service-role server route.
create policy "conversations_anon_chat_widget" on conversations for all to anon using (true) with check (true);

-- disciplinary_warnings
drop policy if exists "open" on disciplinary_warnings;
create policy "disciplinary_warnings_authenticated" on disciplinary_warnings for all to authenticated using (true) with check (true);

-- do_not_return
drop policy if exists "open" on do_not_return;
create policy "do_not_return_authenticated" on do_not_return for all to authenticated using (true) with check (true);

-- employee_assignments
drop policy if exists "open" on employee_assignments;
create policy "employee_assignments_authenticated" on employee_assignments for all to authenticated using (true) with check (true);

-- employee_peoplease_forms
drop policy if exists "open" on employee_peoplease_forms;
create policy "employee_peoplease_forms_authenticated" on employee_peoplease_forms for all to authenticated using (true) with check (true);

-- employee_separations
drop policy if exists "open" on employee_separations;
create policy "employee_separations_authenticated" on employee_separations for all to authenticated using (true) with check (true);

-- employees
drop policy if exists "open" on employees;
create policy "employees_authenticated" on employees for all to authenticated using (true) with check (true);

-- esignature_requests
drop policy if exists "open" on esignature_requests;
create policy "esignature_requests_authenticated" on esignature_requests for all to authenticated using (true) with check (true);

-- expense_categories
drop policy if exists "open" on expense_categories;
create policy "expense_categories_authenticated" on expense_categories for all to authenticated using (true) with check (true);

-- expenses
drop policy if exists "open" on expenses;
create policy "expenses_authenticated" on expenses for all to authenticated using (true) with check (true);

-- inbound_calls
drop policy if exists "open" on inbound_calls;
create policy "inbound_calls_authenticated" on inbound_calls for all to authenticated using (true) with check (true);

-- incident_case_events
drop policy if exists "open" on incident_case_events;
create policy "incident_case_events_authenticated" on incident_case_events for all to authenticated using (true) with check (true);

-- integrations
drop policy if exists "owners_admins_only" on integrations;
create policy "integrations_authenticated" on integrations for all to authenticated using (true) with check (true);

-- integrity_audit_runs
drop policy if exists "open" on integrity_audit_runs;
create policy "integrity_audit_runs_authenticated" on integrity_audit_runs for all to authenticated using (true) with check (true);

-- interviews
drop policy if exists "open" on interviews;
create policy "interviews_authenticated" on interviews for all to authenticated using (true) with check (true);

-- invoice_line_items
drop policy if exists "open" on invoice_line_items;
create policy "invoice_line_items_authenticated" on invoice_line_items for all to authenticated using (true) with check (true);

-- invoice_runs
drop policy if exists "open" on invoice_runs;
create policy "invoice_runs_authenticated" on invoice_runs for all to authenticated using (true) with check (true);

-- invoices
drop policy if exists "open" on invoices;
create policy "invoices_authenticated" on invoices for all to authenticated using (true) with check (true);

-- job_postings
drop policy if exists "open" on job_postings;
create policy "job_postings_authenticated" on job_postings for all to authenticated using (true) with check (true);

-- leave_of_absence_requests
drop policy if exists "open" on leave_of_absence_requests;
create policy "leave_of_absence_requests_authenticated" on leave_of_absence_requests for all to authenticated using (true) with check (true);

-- legal_documents
drop policy if exists "open" on legal_documents;
create policy "legal_documents_authenticated" on legal_documents for all to authenticated using (true) with check (true);

-- meeting_action_items
drop policy if exists "open" on meeting_action_items;
create policy "meeting_action_items_authenticated" on meeting_action_items for all to authenticated using (true) with check (true);

-- meeting_attendees
drop policy if exists "open" on meeting_attendees;
create policy "meeting_attendees_authenticated" on meeting_attendees for all to authenticated using (true) with check (true);

-- meetings
drop policy if exists "open" on meetings;
create policy "meetings_authenticated" on meetings for all to authenticated using (true) with check (true);

-- messages
drop policy if exists "open" on messages;
create policy "messages_authenticated" on messages for all to authenticated using (true) with check (true);
-- STILL OPEN TO anon: required by the public ChatWidget on driven-talent.com.
-- Tighten only after that widget moves behind a service-role server route.
create policy "messages_anon_chat_widget" on messages for all to anon using (true) with check (true);

-- migration_unresolved
drop policy if exists "open" on migration_unresolved;
create policy "migration_unresolved_authenticated" on migration_unresolved for all to authenticated using (true) with check (true);

-- notifications
drop policy if exists "open" on notifications;
create policy "notifications_authenticated" on notifications for all to authenticated using (true) with check (true);

-- onboarding_checklist_items
drop policy if exists "open" on onboarding_checklist_items;
create policy "onboarding_checklist_items_authenticated" on onboarding_checklist_items for all to authenticated using (true) with check (true);

-- onboarding_documents
drop policy if exists "open" on onboarding_documents;
create policy "onboarding_documents_authenticated" on onboarding_documents for all to authenticated using (true) with check (true);

-- payroll_periods
drop policy if exists "open" on payroll_periods;
create policy "payroll_periods_authenticated" on payroll_periods for all to authenticated using (true) with check (true);

-- period_verifications
drop policy if exists "open" on period_verifications;
create policy "period_verifications_authenticated" on period_verifications for all to authenticated using (true) with check (true);

-- position_placements
drop policy if exists "open" on position_placements;
create policy "position_placements_authenticated" on position_placements for all to authenticated using (true) with check (true);

-- positions
drop policy if exists "open" on positions;
create policy "positions_authenticated" on positions for all to authenticated using (true) with check (true);

-- recruiters
drop policy if exists "open" on recruiters;
create policy "recruiters_authenticated" on recruiters for all to authenticated using (true) with check (true);

-- reimbursement_requests
drop policy if exists "open" on reimbursement_requests;
create policy "reimbursement_requests_authenticated" on reimbursement_requests for all to authenticated using (true) with check (true);

-- roster_sync_runs
drop policy if exists "open" on roster_sync_runs;
create policy "roster_sync_runs_authenticated" on roster_sync_runs for all to authenticated using (true) with check (true);

-- safety_incidents
drop policy if exists "open" on safety_incidents;
create policy "safety_incidents_authenticated" on safety_incidents for all to authenticated using (true) with check (true);

-- sales_lead_activities
drop policy if exists "open" on sales_lead_activities;
create policy "sales_lead_activities_authenticated" on sales_lead_activities for all to authenticated using (true) with check (true);

-- sales_leads
drop policy if exists "open" on sales_leads;
create policy "sales_leads_authenticated" on sales_leads for all to authenticated using (true) with check (true);

-- sick_time_entries
drop policy if exists "open" on sick_time_entries;
create policy "sick_time_entries_authenticated" on sick_time_entries for all to authenticated using (true) with check (true);

-- task_reminders
drop policy if exists "open" on task_reminders;
create policy "task_reminders_authenticated" on task_reminders for all to authenticated using (true) with check (true);

-- tasks
drop policy if exists "open" on tasks;
create policy "tasks_authenticated" on tasks for all to authenticated using (true) with check (true);

-- team_members
drop policy if exists "open" on team_members;
create policy "team_members_authenticated" on team_members for all to authenticated using (true) with check (true);

-- termination_fields
drop policy if exists "open" on termination_fields;
create policy "termination_fields_authenticated" on termination_fields for all to authenticated using (true) with check (true);

-- termination_records
drop policy if exists "open" on termination_records;
create policy "termination_records_authenticated" on termination_records for all to authenticated using (true) with check (true);

-- termination_sections
drop policy if exists "open" on termination_sections;
create policy "termination_sections_authenticated" on termination_sections for all to authenticated using (true) with check (true);

-- timecards
drop policy if exists "open" on timecards;
create policy "timecards_authenticated" on timecards for all to authenticated using (true) with check (true);

-- timeclock_punches
drop policy if exists "open" on timeclock_punches;
create policy "timeclock_punches_authenticated" on timeclock_punches for all to authenticated using (true) with check (true);

-- welcome_letter_drafts
drop policy if exists "open" on welcome_letter_drafts;
create policy "welcome_letter_drafts_authenticated" on welcome_letter_drafts for all to authenticated using (true) with check (true);

-- wellness_notes
drop policy if exists "open" on wellness_notes;
create policy "wellness_notes_authenticated" on wellness_notes for all to authenticated using (true) with check (true);

-- workflow_runs
drop policy if exists "open" on workflow_runs;
create policy "workflow_runs_authenticated" on workflow_runs for all to authenticated using (true) with check (true);

-- workflow_scheduled_jobs
drop policy if exists "open" on workflow_scheduled_jobs;
create policy "workflow_scheduled_jobs_authenticated" on workflow_scheduled_jobs for all to authenticated using (true) with check (true);

-- workflow_tasks
drop policy if exists "open" on workflow_tasks;
create policy "workflow_tasks_authenticated" on workflow_tasks for all to authenticated using (true) with check (true);

-- workflows
drop policy if exists "open" on workflows;
create policy "workflows_authenticated" on workflows for all to authenticated using (true) with check (true);
-- ---------------------------------------------------------------------------
-- Storage. `resumes` and `candidate_photos` are declared private in
-- config.toml but their object policies grant `public`, which is why the
-- published anon key can list them. No public surface uploads to these; the
-- app reads and writes them server-side.
--
-- `bug_attachments` (migration 0048) is deliberately left alone: it already
-- does this correctly, with a separate public-insert policy and a staff-read
-- policy. It is the template the four below should have followed.
-- ---------------------------------------------------------------------------

drop policy if exists "resumes open" on storage.objects;
create policy "resumes authenticated" on storage.objects for all to authenticated
  using (bucket_id = 'resumes') with check (bucket_id = 'resumes');

drop policy if exists "invoice_pdfs open" on storage.objects;
create policy "invoice_pdfs authenticated" on storage.objects for all to authenticated
  using (bucket_id = 'invoice_pdfs') with check (bucket_id = 'invoice_pdfs');

drop policy if exists "candidate_photos open" on storage.objects;
create policy "candidate_photos authenticated" on storage.objects for all to authenticated
  using (bucket_id = 'candidate_photos') with check (bucket_id = 'candidate_photos');

drop policy if exists "onboarding_docs open" on storage.objects;
create policy "onboarding_docs authenticated" on storage.objects for all to authenticated
  using (bucket_id = 'onboarding_docs') with check (bucket_id = 'onboarding_docs');

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING (run with the ANON key, not service_role).
-- Every one of these must return zero rows. Today they all return data.
--
--   curl -s "$URL/rest/v1/employees?select=id&limit=1"     -H "apikey: $ANON"
--   curl -s "$URL/rest/v1/candidates?select=id&limit=1"    -H "apikey: $ANON"
--   curl -s "$URL/rest/v1/timecards?select=id&limit=1"     -H "apikey: $ANON"
--   curl -s "$URL/rest/v1/do_not_return?select=id&limit=1" -H "apikey: $ANON"
--   curl -s -X POST "$URL/storage/v1/object/list/resumes" \
--        -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"prefix":""}'
--
-- And these must STILL work:
--   * submitting the form at /report            (anon insert into bug_reports)
--   * the chat widget on driven-talent.com      (anon on the three chat tables)
--   * signing in and loading /candidates        (authenticated)
--   * the 15-minute integrations cron            (service_role)
-- ---------------------------------------------------------------------------
