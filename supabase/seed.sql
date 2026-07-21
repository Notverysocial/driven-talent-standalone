-- Driven Talent — seed data
-- Idempotent (uses on conflict guards). Re-running re-syncs the rich-but-fictional
-- data the existing UI was built against.

-- ---------- clients -----------------------------------------------------

insert into clients (slug, name, city, industry, address, contact_name, contact_email, terms, service_fee_pct, report_format) values
  ('fafixon',            'Fafixon',                  'Stockton, CA',     'Cold Storage / 3PL',          '4400 N Wilson Way · Stockton, CA 95205',     'Anna Rivera',     'anna@fafixon.com',     'Net 30', 8.00, 'standard'),
  ('abc-logistics',      'ABC Logistics',            'Tracy, CA',        'Freight & Distribution',      '610 W Linne Rd · Tracy, CA 95377',           'Marcus Tian',     'marcus@abclog.com',    'Net 30', 8.00, 'standard'),
  ('metro-distribution', 'Metro Distribution',       'Sacramento, CA',   'E-commerce Fulfillment',      '8200 Belvedere Ave · Sacramento, CA 95826',  'Janelle Park',    'janelle@metrodc.com',  'Net 30', 8.00, 'standard'),
  ('pacific-vines',      'Pacific Vines Hotel',      'Healdsburg, CA',   'Hospitality',                 '1840 Coast Highway · Healdsburg, CA 95448',  'Sandra Liu',      'sandra@pacificvines.com', 'Net 30', 8.00, 'standard'),
  ('fabfitfun',          'FabFitFun',                'Los Angeles, CA',  'E-commerce / Subscription',   '360 N Pacific Coast Hwy · El Segundo, CA',   'Lina Park',       'lina.park@fabfitfun.com', 'Net 30', 12.00, 'hours_spent'),
  ('isc',                'ISC',                      'Fontana, CA',      '3PL / Fulfillment',           '15535 Slover Ave · Fontana, CA 92337',       'Jordan McAllister','jordan@isclogistics.com', 'Net 30', 10.00, 'timecard')
on conflict (slug) do update set
  name = excluded.name, city = excluded.city, industry = excluded.industry,
  address = excluded.address, contact_name = excluded.contact_name,
  contact_email = excluded.contact_email, terms = excluded.terms,
  service_fee_pct = excluded.service_fee_pct, report_format = excluded.report_format;

-- ---------- employees (subset of seed for demo) -------------------------

insert into employees (legacy_id, full_name, phone, email, city, hire_date, status, score, band, rank, notes, recruiter, onboarding_in_charge, sick_hours_balance) values
  ('e-001', 'Carlos Mendez',     '(209) 555-0142', 'carlos.mendez@drivenpool.com', 'Stockton, CA',   '2023-04-18', 'active',     94, 'green',  2, 'Anchors first shift at Fafixon. Picks up second shift at ABC twice a week.', 'Rocio',    'Estefany',  18.5),
  ('e-002', 'Yolanda Foster',    '(916) 555-0188', 'y.foster@drivenpool.com',      'Sacramento, CA', '2022-08-11', 'active',     97, 'green',  1, 'Top performer. Anna at ABC requests her by name for cycle counts.',          'Rocio',    'Estefany',  24.0),
  ('e-003', 'Latasha Williams',  '(209) 555-0167', 'latasha.w@drivenpool.com',     'Stockton, CA',   '2024-02-20', 'active',     89, 'green',  4, null,                                                                          'Leangel',  'Estefany',  12.0),
  ('e-004', 'Jamal Thompson',    '(209) 555-0119', 'jamal.t@drivenpool.com',       'Tracy, CA',      '2023-11-06', 'active',     82, 'yellow', 7, 'Solid forklift driver. Watch on Mondays — second job conflict resolving.',  'Rocio',    'Estefany',  9.5),
  ('e-005', 'Maria Hernandez',   '(707) 555-0203', 'maria.h@drivenpool.com',       'Santa Rosa, CA', '2023-01-15', 'active',     93, 'green',  3, 'Lead Line Cook at Pacific Vines. Sandra Liu loves her.',                     'Leangel',  'Estefany',  16.0),
  ('e-006', 'Devon Carter',      '(916) 555-0144', 'devon.c@drivenpool.com',       'Sacramento, CA', '2024-06-12', 'active',     78, 'yellow',10, 'Reliability improving — give him another month.',                            'Rocio',    'Estefany',  6.0),
  ('e-013', 'Priya Anand',       '(415) 555-0126', 'priya.a@drivenpool.com',       'Petaluma, CA',   '2026-04-15', 'onboarding',  0, null,    null, 'Onboarding in progress.',                                                   'Leangel',  'Estefany',  0),
  ('e-018', 'Rashad Coleman',    '(510) 555-0177', 'rashad.c@drivenpool.com',      'Hayward, CA',    '2026-04-29', 'onboarding',  0, null,    null, 'New hire — week one.',                                                      'Rocio',    'Estefany',  0)
on conflict (legacy_id) do update set
  full_name = excluded.full_name, phone = excluded.phone, email = excluded.email,
  city = excluded.city, hire_date = excluded.hire_date, status = excluded.status,
  score = excluded.score, band = excluded.band, rank = excluded.rank, notes = excluded.notes,
  recruiter = excluded.recruiter, onboarding_in_charge = excluded.onboarding_in_charge,
  sick_hours_balance = excluded.sick_hours_balance;

-- ---------- assignments -------------------------------------------------

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
  ('e-006', 'metro-distribution', 'Pick / Pack',       'Warehouse',  '2nd (2p–10p)',date '2024-06-15', 21.50),
  ('e-013', 'fabfitfun',          'Pick / Pack',       'Fulfillment','1st (6a–2p)', date '2026-04-22', 22.00),
  ('e-018', 'isc',                'Forklift Driver',   'Warehouse',  '2nd (2p–10p)',date '2026-05-04', 23.50)
) as a(legacy_id, client_slug, position, department, shift, start_date, hourly_rate)
join employees e on e.legacy_id = a.legacy_id
join clients c on c.slug = a.client_slug;

-- ---------- attendance (last 14 days, demo pattern) ---------------------

delete from attendance_entries
where employee_id in (select id from employees where legacy_id is not null);

insert into attendance_entries (employee_id, client_id, date, status, check_in, check_out, notes)
select
  ea.employee_id,
  ea.client_id,
  d::date,
  case
    when extract(dow from d) in (0, 6) then null
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

delete from attendance_entries where status is null;

-- ---------- onboarding (Estefany's 13-item template) -----------------------

delete from onboarding_checklist_items
where employee_id in (select id from employees where legacy_id is not null);

with items(key, label, detail, category, ord) as (
  values
    ('personal_info',       'Employee personal information received',                  'Verify ID, address, emergency contacts on file',                       'Documentation', 1),
    ('welcome_email',       'Welcome letter sent by email',                            'Generated from template; sent to candidate''s personal email',         'Documentation', 2),
    ('welcome_pandadocs',   'Welcome letter via PandaDocs',                            'Signature required',                                                    'Documentation', 3),
    ('agreement',           'Agreement and Expectations document signed',              'Signature required; varies by client',                                  'Compliance',    4),
    ('orientation',         'Orientation scheduled',                                    'Date, time, person in charge',                                          'Training',      5),
    ('agreement_copy',      'Copy of agreements + orientation sent to employee',       'PDFs forwarded after signing + orientation confirmation',              'Documentation', 6),
    ('background',          'Background check completed',                               'Client-dependent; check whether client requires it',                   'Compliance',    7),
    ('badge_id',            'Badge ID issued',                                          'Site badge issued and confirmed in hand',                              'Equipment',     8),
    ('clock_setup',         'Clock setup',                                              'Time clock provisioned at site',                                       'Equipment',     9),
    ('uattend_register',    'UAttend registration',                                     'Employee registered in UAttend portal',                                'Equipment',    10),
    ('peo_uattend',         'PEO ID assigned in UAttend',                               'PEO identifier mapped to UAttend record',                              'Equipment',    11),
    ('sexual_harassment',   'Sexual harassment training completed',                     'In-person OR online certificate on file',                              'Compliance',   12),
    ('active_folder',       'Active employee folder created',                           'All signed docs uploaded to the employee''s folder',                   'Documentation',13)
)
insert into onboarding_checklist_items (employee_id, key, label, detail, category, status, done_on, notes)
select
  e.id, i.key, i.label, i.detail, i.category::onboarding_category,
  case
    when e.status = 'active' then 'done'::onboarding_status
    when e.legacy_id = 'e-013' and i.ord <= 7 then 'done'::onboarding_status
    when e.legacy_id = 'e-013' and i.ord = 8 then 'in_progress'::onboarding_status
    when e.legacy_id = 'e-018' and i.ord <= 3 then 'done'::onboarding_status
    when e.legacy_id = 'e-018' and i.ord = 4 then 'in_progress'::onboarding_status
    else 'not_started'::onboarding_status
  end,
  case when e.status = 'active' then e.hire_date + interval '5 day' end::date,
  null
from employees e
cross join items i;

-- Onboarding documents (preserved from prior seed; orthogonal to checklist)
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
  ('I-9 Supporting Docs')
) as d(name);

-- ---------- candidates --------------------------------------------------

delete from candidates where email like '%@example.driven%';

insert into candidates (full_name, email, phone, city, applied_for, source, applied_at, experience_years, certifications, status, recruiter, notes, criteria, score, client_id) values
  ('Daniel Ortega',    'daniel.ortega@example.driven',  '(707) 555-0188', 'Petaluma, CA',  'Senior Caregiver · Healthcare', 'Referral · Priya Anand',  current_date - 8,  6.0,
   array['CNA · CA Active','BLS / CPR','HHA Certified','Bilingual ES/EN'],
   'screening', 'Rocio',
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
   'applied', 'Leangel',
   'Heard about us from her cousin who works at ABC. Worth a phone screen.',
   '[]'::jsonb, null, (select id from clients where slug = 'abc-logistics')),
  ('Trevor Quinn',     'trevor.quinn@example.driven',  '(209) 555-0166', 'Manteca, CA',   'Inventory Control · Warehouse', 'Indeed',                  current_date - 12, 2.0,
   array['OSHA-10','RF Scanner'],
   'interview', 'Rocio',
   'Strong on cycle counts in his last role. Scheduling onsite at Fafixon next Tuesday.',
   '[]'::jsonb, null, (select id from clients where slug = 'fafixon')),
  ('Marisol Cruz',     'marisol.cruz@example.driven',  '(626) 555-0142', 'El Monte, CA',  'Pick / Pack · Fulfillment',     'Indeed',                  current_date - 5,  3.0,
   array['OSHA-10'],
   'offer', 'Rocio',
   'Verbal offer extended for FabFitFun second shift. Awaiting signed offer letter.',
   '[]'::jsonb, null, (select id from clients where slug = 'fabfitfun'));

-- ---------- payroll periods --------------------------------------------

delete from payroll_periods where start_date >= current_date - interval '21 day';

insert into payroll_periods (start_date, end_date, status, notes) values
  (((current_date - extract(dow from current_date)::int) - interval '2 week')::date, ((current_date - extract(dow from current_date)::int) - interval '1 week' - interval '1 day')::date, 'approved', 'Closed and invoiced.'),
  (((current_date - extract(dow from current_date)::int) - interval '1 week')::date, ((current_date - extract(dow from current_date)::int) - interval '1 day')::date,                       'audited',  'Audit complete; awaiting client approvals.'),
  (((current_date - extract(dow from current_date)::int))::date,                      ((current_date - extract(dow from current_date)::int) + interval '6 day')::date,                      'open',     'Current pay period.');

-- ---------- timecards ---------------------------------------------------

delete from timecards where employee_id in (select id from employees where legacy_id is not null);

insert into timecards (employee_id, client_id, week_start, days, reg_hours, ot_hours, holiday_hours, sick_hours, hourly_rate, status, submitted_at, approved_by, approved_at, payroll_period_id, flags)
select
  e.id, c.id, ((current_date - extract(dow from current_date)::int) - interval '1 week')::date,
  '{
    "mon": {"regular": 8.0, "overtime": 0,   "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "tue": {"regular": 8.0, "overtime": 0.5, "holiday": 0, "in": "06:00", "out": "15:00", "locked": true},
    "wed": {"regular": 8.0, "overtime": 1.5, "holiday": 0, "in": "05:30", "out": "15:30", "locked": true},
    "thu": {"regular": 8.0, "overtime": 0,   "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "fri": {"regular": 8.0, "overtime": 2.0, "holiday": 0, "in": "05:00", "out": "15:30", "locked": true},
    "sat": {"regular": 6.0, "overtime": 0,   "holiday": 0, "in": "08:00", "out": "14:30", "locked": true},
    "sun": {"regular": 0,   "overtime": 0,   "holiday": 0, "in": null,    "out": null,    "locked": true}
  }'::jsonb,
  46.0, 4.0, 0, 0, 28.50, 'approved', now() - interval '4 day', 'Roxanna', now() - interval '3 day',
  (select id from payroll_periods where status = 'audited' limit 1),
  '{}'::jsonb
from employees e, clients c
where e.legacy_id = 'e-005' and c.slug = 'pacific-vines';

insert into timecards (employee_id, client_id, week_start, days, reg_hours, ot_hours, holiday_hours, sick_hours, hourly_rate, status, submitted_at, payroll_period_id, flags)
select
  e.id, c.id, (current_date - extract(dow from current_date)::int)::date,
  '{
    "mon": {"regular": 8.0, "overtime": 0, "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "tue": {"regular": 8.0, "overtime": 0, "holiday": 0, "in": "06:00", "out": "14:30", "locked": true},
    "wed": {"regular": 8.0, "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false},
    "thu": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false},
    "fri": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false},
    "sat": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false},
    "sun": {"regular": 0,   "overtime": 0, "holiday": 0, "in": null,    "out": null,    "locked": false}
  }'::jsonb,
  24.0, 0, 0, 0, 24.50, 'submitted', now() - interval '6 hour',
  (select id from payroll_periods where status = 'open' limit 1),
  '{"missed_punch": true, "punch_day": "wed"}'::jsonb
from employees e, clients c
where e.legacy_id = 'e-001' and c.slug = 'fafixon';

-- ---------- one example invoice + line items ---------------------------

delete from invoices where number = 'DT-2026-0417';

insert into invoices (number, client_id, period_start, period_end, issued_at, due_at, terms, subtotal, fee_pct, fee, tax, total, status, payroll_period_id, bill_to_client_name)
select
  'DT-2026-0417',
  c.id,
  current_date - 14,
  current_date - 1,
  current_date - 1,
  current_date + 29,
  'Net 30',
  7080.50, 8.00, 566.44, 0, 7646.94,
  'sent',
  (select id from payroll_periods where status = 'approved' limit 1),
  null
from clients c where c.slug = 'pacific-vines';

insert into invoice_line_items (invoice_id, department, employee_name, role, hours, ot_hours, rate, amount, employee_cost, sort_order)
select i.id, d.dept, d.who, d.role, d.hours, d.ot, d.rate, d.amount, d.cost, d.ord
from invoices i, (values
  ('Hospitality — Front of House', 'Aaliyah Brooks',           'Front Desk Lead',     78.5, 4.0, 23.50, 1891.75, 1750.74, 0),
  ('Hospitality — Front of House', 'Marcus Webb',              'Banquet Server',      64.0, 0,   19.50, 1248.00, 1155.36, 1),
  ('Hospitality — Kitchen',        'Maria Hernandez',          'Lead Line Cook',      76.0, 4.0, 28.50, 2223.00, 2058.43, 2),
  ('Hospitality — Kitchen',        'Two prep cooks (pooled)',  'Prep · part-time',    92.5, 0,   21.00, 1942.50, 1798.20, 3)
) as d(dept, who, role, hours, ot, rate, amount, cost, ord)
where i.number = 'DT-2026-0417';
