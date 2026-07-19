-- 0043_sales_lead_notified.sql
--
-- New-employer-lead email notification (revenue side). Employer leads arrive
-- from the public site straight into sales_leads (source='inbound_web') and
-- nothing alerted the team, so a real lead once sat unworked. A scheduled sweep
-- (/api/leads/notify) emails the team about each new inbound lead. This column
-- is the idempotency marker: it is stamped only after a lead has been emailed,
-- so no lead is ever notified twice and the sweep is safe to run repeatedly.
--
-- Additive + idempotent, no destructive statements. Numbered 0043 (next after
-- 0042_integrity_audit_runs).

alter table sales_leads
  add column if not exists lead_notified_at timestamptz;

-- Partial index for the sweep's hot query: inbound web leads not yet notified.
create index if not exists sales_leads_unnotified_inbound_idx
  on sales_leads (created_at)
  where source = 'inbound_web' and lead_notified_at is null;
