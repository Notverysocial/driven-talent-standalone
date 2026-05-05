-- Driven Talent — seed data
-- Idempotent (uses on conflict guards). Re-running re-syncs the rich-but-fictional
-- data the existing UI was built against.

-- ---------- clients -----------------------------------------------------

insert into clients (slug, name, city, industry, address, contact_name, contact_email, terms, service_fee_pct) values
  ('fafixon',            'Fafixon',                  'Stockton, CA',     'Cold Storage / 3PL',          '4400 N Wilson Way · Stockton, CA 95205',     'Anna Rivera',     'anna@fafixon.com',     'Net 30', 8.00),
  ('abc-logistics',      'ABC Logistics',            'Tracy, CA',        'Freight & Distribution',      '610 W Linne Rd · Tracy, CA 95377',           'Marcus Tian',     'marcus@abclog.com',    'Net 30', 8.00),
  ('metro-distribution', 'Metro Distribution',       'Sacramento, CA',   'E-commerce Fulfillment',      '8200 Belvedere Ave · Sacramento, CA 95826',  'Janelle Park',    'janelle@metrodc.com',  'Net 30', 8.00),
  ('pacific-vines',      'Pacific Vines Hotel',      'Healdsburg, CA',   'Hospitality',                 '1840 Coast Highway · Healdsburg, CA 95448',  'Sandra Liu',      'sandra@pacificvines.com', 'Net 30', 8.00)
on conflict (slug) do update set
  name = excluded.name, city = excluded.city, industry = excluded.industry,
  address = excluded.address, contact_name = excluded.contact_name,
  contact_email = excluded.contact_email, terms = excluded.terms,
  service_fee_pct = excluded.service_fee_pct;

-- ---------- employees (subset of seed for demo) -------------------------

insert into employees (legacy_id, full_name, phone, email, city, hire_date, status, score, band, rank, notes) values
  ('e-001', 'Carlos Mendez',     '(209) 555-0142', 'carlos.mendez@drivenpool.com', 'Stockton, CA',   '2023-04-18', 'active',     94, 'green',  2, 'Anchors first shift at Fafixon. Picks up second shift at ABC twice a week.'),
  ('e-002', 'Yolanda Foster',    '(916) 555-0188', 'y.foster@drivenpool.com',      'Sacramento, CA', '2022-08-11', 'active',     97, 'green',  1, 'Top performer. Anna at ABC requests her by name for cycle counts.'),
  ('e-003', 'Latasha Williams',  '(209) 555-0167', 'latasha.w@drivenpool.com',     'Stockton, CA',   '2024-02-20', 'active',     89, 'green',  4, null),
  ('e-004', 'Jamal Thompson',    '(209) 555-0119', 'jamal.t@drivenpool.com',       'Tracy, CA',      '2023-11-06', 'active',     82, 'yellow', 7, 'Solid forklift driver. Watch on Mondays — second job conflict resolving.'),
  ('e-005', 'Maria Hernandez',   '(707) 555-0203', 'maria.h@drivenpool.com',       'Santa Rosa, CA', '2023-01-15', 'active',     93, 'green',  3, 'Lead Line Cook at Pacific Vines. Sandra Liu loves her.'),
  ('e-006', 'Devon Carter',      '(916) 555-0144', 'devon.c@drivenpool.com',       'Sacramento, CA', '2024-06-12', 'active',     78, 'yellow',10, 'Reliability improving — give him another month.'),
  ('e-013', 'Priya Anand',       '(415) 555-0126', 'priya.a@drivenpool.com',       'Petaluma, CA',   '2026-04-15', 'onboarding',  0, null,    null, '15-step onboarding in progress.'),
  ('e-018', 'Rashad Coleman',    '(510) 555-0177', 'rashad.c@drivenpool.com',      'Hayward, CA',    '2026-04-29', 'onboarding',  0, null,    null, 'New hire — week one.')
on conflict (legacy_id) do update set
  full_name = excluded.full_name, phone = excluded.phone, email = excluded.email,
  city = excluded.city, hire_date = excluded.hire_date, status = excluded.status,
  score = excluded.score, band = excluded.band, rank = excluded.rank, notes = excluded.notes;

-- ---------- assignments -------------------------------------------------

-- Wipe existing rows for these employees so the seed is fully deterministic
delete from employee_assignments
where employee_id in (select id from employees where legacy_id is not null);

insert into employee_assignments (employee_id, client_id, position, department, shift, start_date, hourly_rate, active)
select e.id, c.id, a.position, a.department, a.shift, a.start_date, a.hourly_rate, true
from (values
  ('e-001', 'fafixon',            'Forklift Driver',   'Warehouse',  '1st (6a–2p)', date '2024-01-08', 24.50),
  ('e-001', 'abc-logistics',      'Forklift Driver',   'Warehouse',  '2nd (2p–10p)',date '2025-06-02', 25.00),
  ('e-002', 'abc-logistics',      'Lead',              'Inventory',  '1st (6a–2p)', date '2024-03-04', 28.00),
  ('e-003', 'fafixon',            'Inventory Control', 'Inventory',  '1st (6a–2p)', date '2024-02-26', 22.50),
  ('e-004', 'abc-logistics',      'Forklift Driver',   'Warehouse',  '1st (6a–2p)', date '2024-01-15', 24.00),
  ('e-005', 'pacific-vines',      'Lead Line Cook',    'Hospitality','1st (6a–2p)', date '2023-02-01', 28.50),
  ('e-006', 'metro-distribution', 'Pick / Pack',       'Warehouse',  '2nd (2p–10p)',date '2024-06-15', 21.50)
) as a(legacy_id, client_slug, position, department, shift, start_date, hourly_rate)
join employees e on e.legacy_id = a.legacy_id
join clients c on c.slug = a.client_slug;

-- ---------- attendance (last 14 days, demo pattern) ---------------------
-- Generate realistic-ish attendance for each active employee on each of their assignments.

delete from attendance_entries
where employee_id in (select id from employees where legacy_id is not null);

insert into attendance_entries (employee_id, client_id, date, status, check_in, check_out, notes)
select
  ea.employee_id,
  ea.client_id,
  d::date,
  case
    when extract(dow from d) in (0, 6) then null  -- skip weekends, filtered below
    when (extract(day from d)::int + (ea.hourly_rate::int)) % 17 = 0 then 'no_show'::attendance_status
    when (extract(day from d)::int + (ea.hourly_rate::int)) % 11 = 0 then 'missed'::attendance_status
    when (extract(day from d)::int + (ea.hourly_rate::int)) %  7 = 0 then 'late'::attendance_status
    when (extract(day from d)::int + (ea.hourly_rate::int)) % 13 = 0 then 'excused'::attendance_status
    else 'present'::attendance_status
  end,
  case when (extract(day from d)::int + (ea.hourly_rate::int)) % 7 = 0 then time '06:12' else time '05:58' end,
  time '14:30',
  null
from employee_assignments ea
cross join generate_series(current_date - interval '20 day', current_date - interval '1 day', interval '1 day') as d
where extract(dow from d) not in (0, 6)
  and ea.active = true;

-- Drop the rows that came back null (weekends)
delete from attendance_entries where status is null;

-- ---------- onboarding (15-step checklist for active + partial for onboarding) ---

delete from onboarding_checklist_items
where employee_id in (select id from employees where legacy_id is not null);

-- 15 standard items. For active employees they're all done; for onboarding employees, partial.
with items(key, label, detail, category) as (
  values
    ('i9',             'Form I-9 — Employment Eligibility',         'Verify identity & work authorization within 3 days of hire', 'Compliance'),
    ('w4',             'Form W-4 — Tax Withholding',                'Federal & California state tax election',                    'Documentation'),
    ('directdeposit',  'Direct Deposit Authorization',              'Bank routing & account on file',                              'Documentation'),
    ('background',     'Background Check Cleared',                  '7-year criminal + employment verification',                   'Compliance'),
    ('drug',           'Drug Screen — 5-Panel',                     'Required for warehouse + driving positions',                  'Compliance'),
    ('handbook',       'Employee Handbook Acknowledged',            'Signed receipt of policies & code of conduct',                'Documentation'),
    ('safety',         'OSHA-10 Safety Training',                   '10-hour general industry certification',                      'Training'),
    ('forklift',       'Forklift Certification (if applicable)',    'Powered industrial truck operator license',                   'Training'),
    ('siteorientation','Client Site Orientation',                   'Walkthrough at assigned client facility',                     'Training'),
    ('ppe',            'PPE Issued',                                 'Hi-vis vest, steel-toe boots, hard hat, gloves',              'Equipment'),
    ('badge',          'Site Badge & Access Credentials',           'Photo ID, badge, parking permit',                             'Equipment'),
    ('uniform',        'Uniform Sizing & Issuance',                 '2 sets minimum, branded with Driven Talent',                  'Equipment'),
    ('day1',           'Day-1 Check-In Call',                       'Driven Talent rep confirms first-day arrival',                'Review'),
    ('day7',           '7-Day Review',                              'Coordinator + supervisor sync on early performance',          'Review'),
    ('day30',          '30-Day Review',                             'Formal performance check + scoring entry',                    'Review')
)
insert into onboarding_checklist_items (employee_id, key, label, detail, category, done, done_on)
select
  e.id, i.key, i.label, i.detail, i.category::onboarding_category,
  case
    when e.status = 'active' then true
    when e.legacy_id = 'e-013' and i.key in ('i9','w4','directdeposit','background','drug','handbook','forklift') then true
    when e.legacy_id = 'e-018' and i.key in ('i9','w4','directdeposit') then true
    else false
  end as done,
  case when e.status = 'active' then e.hire_date + interval '5 day' end::date
from employees e
cross join items i;

-- Standard onboarding documents (5 items per employee)
delete from onboarding_documents where employee_id in (select id from employees where legacy_id is not null);

insert into onboarding_documents (employee_id, name, received, received_on)
select e.id, d.name,
  case when e.status = 'active' then true else false end,
  case when e.status = 'active' then e.hire_date + interval '3 day' end::date
from employees e
cross join (values
  ('Driver''s License'),
  ('Social Security Card'),
  ('Direct Deposit Form'),
  ('Emergency Contact'),
  ('Forklift Cert')
) as d(name);

-- ---------- candidates (with weighted-scoring criteria) -----------------

delete from candidates where email like '%@example.driven%';

insert into candidates (full_name, email, phone, city, applied_for, source, applied_at, experience_years, certifications, status, notes, criteria, score, client_id) values
  ('Daniel Ortega',    'daniel.ortega@example.driven',  '(707) 555-0188', 'Petaluma, CA',  'Senior Caregiver · Healthcare', 'Referral · Priya Anand',  current_date - 8,  6.0,
   array['CNA · CA Active','BLS / CPR','HHA Certified','Bilingual ES/EN'],
   'screening',
   'Daniel is the kind of caregiver families ask for by name. Priya vouched for him personally — she trained him at his last facility and said he stayed late for residents nobody else wanted to sit with.',
   '[
     {"key":"experience","label":"Relevant Experience","sub":"Years and depth in role","weight":20,"value":88,"note":"6 yrs across 2 senior-living facilities"},
     {"key":"skills","label":"Hard Skills","sub":"Certifications, technical fit","weight":20,"value":92,"note":"CNA + HHA + BLS — all current"},
     {"key":"soft","label":"Communication","sub":"Warmth, clarity, listening","weight":15,"value":95,"note":"Bilingual; exceptional in interview"},
     {"key":"reliability","label":"Reliability","sub":"References, attendance history","weight":20,"value":84,"note":"2 strong refs · 1 outstanding callback"},
     {"key":"culture","label":"Culture Fit","sub":"Client environment alignment","weight":15,"value":90,"note":"Sonoma Senior Living shortlist match"},
     {"key":"flex","label":"Schedule Flexibility","sub":"Shifts, weekends, on-call","weight":10,"value":70,"note":"Weekdays preferred · open to Sat AM"}
   ]'::jsonb,
   88.55, null),
  ('Aisha Bennett',    'aisha.bennett@example.driven', '(415) 555-0211', 'San Rafael, CA','Forklift Driver · Warehouse',   'LinkedIn',                current_date - 3,  4.5,
   array['Forklift Cert','OSHA-10'],
   'new',
   'Heard about us from her cousin who works at ABC. Worth a phone screen.',
   '[]'::jsonb, null, (select id from clients where slug = 'abc-logistics')),
  ('Trevor Quinn',     'trevor.quinn@example.driven',  '(209) 555-0166', 'Manteca, CA',   'Inventory Control · Warehouse', 'Indeed',                  current_date - 12, 2.0,
   array['OSHA-10','RF Scanner'],
   'interview',
   'Strong on cycle counts in his last role. Scheduling onsite at Fafixon next Tuesday.',
   '[]'::jsonb, null, (select id from clients where slug = 'fafixon'));

-- ---------- timecards (one approved week for the invoice demo) ----------

delete from timecards where employee_id in (select id from employees where legacy_id is not null);

-- Maria Hernandez at Pacific Vines, week of two Mondays ago (so the period has shipped).
insert into timecards (employee_id, client_id, week_start, days, reg_hours, ot_hours, holiday_hours, hourly_rate, status, submitted_at, approved_by, approved_at)
select
  e.id, c.id, (date_trunc('week', current_date) - interval '1 week')::date,
  '{
    "mon": {"regular": 8.0, "overtime": 0,   "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "tue": {"regular": 8.0, "overtime": 0.5, "holiday": 0, "in": "06:00", "out": "15:00", "locked": true},
    "wed": {"regular": 8.0, "overtime": 1.5, "holiday": 0, "in": "05:30", "out": "15:30", "locked": true},
    "thu": {"regular": 8.0, "overtime": 0,   "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "fri": {"regular": 8.0, "overtime": 2.0, "holiday": 0, "in": "05:00", "out": "15:30", "locked": true},
    "sat": {"regular": 6.0, "overtime": 0,   "holiday": 0, "in": "08:00", "out": "14:30", "locked": true},
    "sun": {"regular": 0,   "overtime": 0,   "holiday": 0, "in": null,    "out": null,    "locked": true}
  }'::jsonb,
  46.0, 4.0, 0, 28.50, 'approved', now() - interval '4 day', 'Roxanna', now() - interval '3 day'
from employees e, clients c
where e.legacy_id = 'e-005' and c.slug = 'pacific-vines';

-- One submitted (pending approval) for demo
insert into timecards (employee_id, client_id, week_start, days, reg_hours, ot_hours, holiday_hours, hourly_rate, status, submitted_at)
select
  e.id, c.id, date_trunc('week', current_date)::date,
  '{
    "mon": {"regular": 8.0, "overtime": 0, "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "tue": {"regular": 8.0, "overtime": 0, "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "wed": {"regular": 8.0, "overtime": 0, "holiday": 0, "in": "06:00", "out": "14:30", "locked": false},
    "thu": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false},
    "fri": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false},
    "sat": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false},
    "sun": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false}
  }'::jsonb,
  24.0, 0, 0, 24.50, 'submitted', now() - interval '6 hour'
from employees e, clients c
where e.legacy_id = 'e-001' and c.slug = 'fafixon';

-- ---------- one example invoice + line items ---------------------------

delete from invoices where number = 'DT-2026-0417';

insert into invoices (number, client_id, period_start, period_end, issued_at, due_at, terms, subtotal, fee_pct, fee, tax, total, status)
select
  'DT-2026-0417',
  c.id,
  current_date - 14,
  current_date - 1,
  current_date - 1,
  current_date + 29,
  'Net 30',
  7080.50, 8.00, 566.44, 0, 7646.94,
  'sent'
from clients c where c.slug = 'pacific-vines';

insert into invoice_line_items (invoice_id, department, employee_name, role, hours, ot_hours, rate, amount, sort_order)
select i.id, d.dept, d.who, d.role, d.hours, d.ot, d.rate, d.amount, d.ord
from invoices i, (values
  ('Hospitality — Front of House', 'Aaliyah Brooks',           'Front Desk Lead',     78.5, 4.0, 23.50, 1891.75, 0),
  ('Hospitality — Front of House', 'Marcus Webb',              'Banquet Server',      64.0, 0,   19.50, 1248.00, 1),
  ('Hospitality — Kitchen',        'Maria Hernandez',          'Lead Line Cook',      76.0, 4.0, 28.50, 2223.00, 2),
  ('Hospitality — Kitchen',        'Two prep cooks (pooled)',  'Prep · part-time',    92.5, 0,   21.00, 1942.50, 3)
) as d(dept, who, role, hours, ot, rate, amount, ord)
where i.number = 'DT-2026-0417';
