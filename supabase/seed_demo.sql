-- Driven Talent — comprehensive demo seed
-- =========================================================================
-- Realistic-but-obviously-fake test data that populates the WHOLE app so the
-- DT ops team can click through every workflow and see records sitting at
-- every stage. Run AFTER migrations 0000-0006 have been applied.
--
-- Idempotent: re-running wipes the demo rows (in FK-safe order) and recreates
-- them. US federal holidays seeded by 0003_calendar.sql are preserved.
--
-- All people, phone numbers, emails and companies here are fictional.
-- Applicant / candidate / contact emails use @example.com on purpose.
-- =========================================================================

begin;

-- ---------- wipe (children first, FK-safe) ------------------------------

delete from invoice_line_items;
delete from invoice_runs;
delete from invoices;
delete from sick_time_entries;
delete from timecards;
delete from payroll_periods;
delete from leave_of_absence_requests;
delete from safety_incidents;
delete from disciplinary_warnings;
delete from attendance_entries;
delete from onboarding_checklist_items;
delete from onboarding_documents;
delete from welcome_letter_drafts;
delete from position_placements;
delete from positions;
delete from application_intakes;
delete from messages;
delete from conversations;
delete from contacts;
delete from inbound_calls;
delete from calendar_events where kind <> 'holiday';
delete from candidates;
delete from employee_assignments;
delete from employees;
delete from clients;

-- ---------- clients -----------------------------------------------------

insert into clients (slug, name, city, industry, address, contact_name, contact_email, terms, service_fee_pct, report_format) values
  ('fafixon',            'Fafixon',               'Stockton, CA',   'Cold Storage / 3PL',        '4400 N Wilson Way · Stockton, CA 95205',      'Anna Rivera',      'anna@example.com',     'Net 30',  8.00, 'standard'),
  ('abc-logistics',      'ABC Logistics',         'Tracy, CA',      'Freight & Distribution',    '610 W Linne Rd · Tracy, CA 95377',            'Marcus Tian',      'marcus@example.com',   'Net 30',  8.00, 'standard'),
  ('metro-distribution', 'Metro Distribution',    'Sacramento, CA', 'E-commerce Fulfillment',    '8200 Belvedere Ave · Sacramento, CA 95826',   'Janelle Park',     'janelle@example.com',  'Net 30',  8.00, 'standard'),
  ('pacific-vines',      'Pacific Vines Hotel',   'Healdsburg, CA', 'Hospitality',               '1840 Coast Highway · Healdsburg, CA 95448',   'Sandra Liu',       'sandra@example.com',   'Net 30',  8.00, 'standard'),
  ('fabfitfun',          'FabFitFun',             'El Segundo, CA', 'E-commerce / Subscription', '360 N Pacific Coast Hwy · El Segundo, CA',     'Lina Park',        'lina.park@example.com','Net 30', 12.00, 'hours_spent'),
  ('isc',                'ISC',                   'Fontana, CA',    '3PL / Fulfillment',         '15535 Slover Ave · Fontana, CA 92337',        'Jordan McAllister','jordan@example.com',   'Net 30', 10.00, 'timecard'),
  ('sonoma-senior',      'Sonoma Senior Living',  'Santa Rosa, CA', 'Healthcare',                '500 Wikiup Dr · Santa Rosa, CA 95403',        'Helen Brunner',    'helen@example.com',    'Net 30',  9.00, 'standard'),
  ('valley-foods',       'Valley Fresh Foods',    'Modesto, CA',    'Food Manufacturing',        '2120 Crows Landing Rd · Modesto, CA 95358',   'Raymond Ortiz',    'raymond@example.com',  'Net 45',  8.00, 'standard');

-- ---------- employees ---------------------------------------------------
-- 14 active · 4 onboarding · 2 inactive

insert into employees (legacy_id, full_name, phone, email, city, hire_date, status, score, band, rank, birthday, recruiter, onboarding_in_charge, sick_hours_balance, notes) values
  ('e-001','Carlos Mendez',     '(209) 555-0142','carlos.mendez@drivenpool.com','Stockton, CA',   '2023-04-18','active',     94,'green', 2,'1986-03-14','Rocio',  'Estefany',18.5,'Anchors first shift at Fafixon; picks up a second shift at ABC twice a week.'),
  ('e-002','Yolanda Foster',    '(916) 555-0188','y.foster@drivenpool.com',     'Sacramento, CA', '2022-08-11','active',     97,'green', 1,'1990-07-22','Rocio',  'Estefany',24.0,'Top performer. ABC requests her by name for cycle counts.'),
  ('e-003','Latasha Williams',  '(209) 555-0167','latasha.w@drivenpool.com',    'Stockton, CA',   '2024-02-20','active',     89,'green', 6,'1993-11-02','Leangel','Estefany',12.0,null),
  ('e-004','Jamal Thompson',    '(209) 555-0119','jamal.t@drivenpool.com',      'Tracy, CA',      '2023-11-06','active',     82,'yellow',10,'1988-01-30','Rocio',  'Estefany', 9.5,'Solid forklift driver — watch Mondays, second-job conflict resolving.'),
  ('e-005','Maria Hernandez',   '(707) 555-0203','maria.h@drivenpool.com',      'Santa Rosa, CA', '2023-01-15','active',     93,'green', 3,'1985-09-12','Leangel','Estefany',16.0,'Lead Line Cook at Pacific Vines. Sandra Liu loves her.'),
  ('e-006','Devon Carter',      '(916) 555-0144','devon.c@drivenpool.com',      'Sacramento, CA', '2024-06-12','active',     78,'yellow',12,'1995-06-08','Rocio',  'Estefany', 6.0,'Reliability improving — give him another month.'),
  ('e-007','Brianna Nguyen',    '(209) 555-0241','brianna.n@drivenpool.com',    'Modesto, CA',    '2024-09-09','active',     91,'green', 4,'1992-04-19','Leangel','Estefany',20.0,'Fast learner; cross-trained on two production lines.'),
  ('e-008','Marcus Webb',       '(707) 555-0155','marcus.w@drivenpool.com',     'Healdsburg, CA', '2023-05-22','active',     86,'green', 8,'1989-12-05','Leangel','Estefany',14.5,'Banquet server — great with large events.'),
  ('e-009','Tanya Brooks',      '(909) 555-0178','tanya.b@drivenpool.com',      'Fontana, CA',    '2024-03-18','active',     80,'yellow',11,'1991-08-27','Rocio',  'Estefany', 3.0,null),
  ('e-010','Hector Salinas',    '(209) 555-0190','hector.s@drivenpool.com',     'Tracy, CA',      '2022-12-01','active',     88,'green', 7,'1984-02-11','Rocio',  'Estefany',22.0,'Shift lead at ABC. Dependable and calm under pressure.'),
  ('e-011','Aaliyah Brooks',    '(707) 555-0166','aaliyah.b@drivenpool.com',    'Healdsburg, CA', '2024-07-15','active',     90,'green', 5,'1994-05-29','Leangel','Estefany', 8.0,'Front desk lead at Pacific Vines.'),
  ('e-012','Sergey Volkov',     '(916) 555-0233','sergey.v@drivenpool.com',     'Sacramento, CA', '2025-01-20','active',     74,'yellow',13,'1987-10-16','Rocio',  'Estefany',11.5,'Coaching plan in place; one written warning on file.'),
  ('e-013','Nadia Hassan',      '(209) 555-0277','nadia.h@drivenpool.com',      'Stockton, CA',   '2024-11-04','active',     84,'yellow', 9,'1996-03-03','Leangel','Estefany', 5.0,null),
  ('e-014','Quincy Adams',      '(909) 555-0212','quincy.a@drivenpool.com',     'Fontana, CA',    '2025-03-10','active',     68,'red',   14,'1983-07-07','Rocio',  'Estefany', 0.0,'Final warning issued — performance plan, 30-day review.'),
  ('e-015','Priya Anand',       '(415) 555-0126','priya.a@drivenpool.com',      'Petaluma, CA',   '2026-05-11','onboarding',  0,null,  null,'1997-05-25','Leangel','Estefany', 0.0,'Onboarding well underway — week two.'),
  ('e-016','Rashad Coleman',    '(510) 555-0177','rashad.c@drivenpool.com',     'Hayward, CA',    '2026-05-18','onboarding',  0,null,  null,'1999-06-14','Rocio',  'Estefany', 0.0,'New hire — week one.'),
  ('e-017','Emily Tran',        '(209) 555-0288','emily.t@drivenpool.com',      'Modesto, CA',    '2026-05-20','onboarding',  0,null,  null,'1998-05-30','Leangel','Estefany', 0.0,'Just started — paperwork in progress.'),
  ('e-018','Darnell Pierce',    '(209) 555-0299','darnell.p@drivenpool.com',    'Stockton, CA',   '2026-05-22','onboarding',  0,null,  null,'2000-09-21','Rocio',  'Estefany', 0.0,'Day one — orientation scheduled.'),
  ('e-019','Gregory Pearson',   '(209) 555-0301','gregory.p@drivenpool.com',    'Tracy, CA',      '2023-08-14','inactive',   71,'yellow',null,'1982-04-02','Rocio',  'Estefany', 0.0,'Separated 2026-03 — relocated out of state.'),
  ('e-020','Christina Lowe',    '(916) 555-0312','christina.l@drivenpool.com',  'Sacramento, CA', '2024-05-06','inactive',   76,'yellow',null,'1990-11-18','Leangel','Estefany', 4.0,'Inactive — on indefinite personal leave, no return date.');

-- ---------- employee_assignments ----------------------------------------

insert into employee_assignments (employee_id, client_id, position, department, shift, start_date, hourly_rate, bill_rate, branch, active)
select e.id, c.id, a.position, a.department, a.shift, a.start_date, a.hourly_rate, a.bill_rate, a.branch, a.active
from (values
  ('e-001','fafixon',           'Forklift Driver',     'Warehouse',     '1st (6a-2p)',  date '2023-04-18', 24.50, 33.00, 'Stockton', true),
  ('e-001','abc-logistics',     'Forklift Driver',     'Warehouse',     '2nd (2p-10p)', date '2025-06-02', 25.00, 33.50, 'Tracy',    true),
  ('e-002','abc-logistics',     'Lead',                'Inventory',     '1st (6a-2p)',  date '2022-08-11', 28.00, 37.50, 'Tracy',    true),
  ('e-003','fafixon',           'Inventory Control',   'Inventory',     '1st (6a-2p)',  date '2024-02-20', 22.50, 30.00, 'Stockton', true),
  ('e-004','abc-logistics',     'Forklift Driver',     'Warehouse',     '1st (6a-2p)',  date '2023-11-06', 24.00, 32.00, 'Tracy',    true),
  ('e-005','pacific-vines',     'Lead Line Cook',      'Hospitality',   '1st (6a-2p)',  date '2023-01-15', 28.50, 38.00, 'Healdsburg',true),
  ('e-006','metro-distribution','Pick / Pack',         'Warehouse',     '2nd (2p-10p)', date '2024-06-12', 21.50, 28.50, 'Sacramento',true),
  ('e-007','valley-foods',      'Production Associate','Manufacturing', '1st (6a-2p)',  date '2024-09-09', 21.00, 28.00, 'Modesto',  true),
  ('e-008','pacific-vines',     'Banquet Server',      'Hospitality',   '2nd (2p-10p)', date '2023-05-22', 19.50, 26.00, 'Healdsburg',true),
  ('e-009','isc',               'Forklift Driver',     'Warehouse',     '2nd (2p-10p)', date '2024-03-18', 23.50, 31.00, 'Fontana',  true),
  ('e-010','abc-logistics',     'Shift Lead',          'Warehouse',     '1st (6a-2p)',  date '2022-12-01', 27.00, 36.00, 'Tracy',    true),
  ('e-011','pacific-vines',     'Front Desk Lead',     'Hospitality',   '1st (6a-2p)',  date '2024-07-15', 23.50, 31.50, 'Healdsburg',true),
  ('e-012','metro-distribution','Pick / Pack',         'Warehouse',     '1st (6a-2p)',  date '2025-01-20', 21.00, 28.00, 'Sacramento',true),
  ('e-013','fabfitfun',         'Pick / Pack',         'Fulfillment',   '2nd (2p-10p)', date '2024-11-04', 22.00, 30.00, 'Chino',    true),
  ('e-014','isc',               'Material Handler',    'Warehouse',     '2nd (2p-10p)', date '2025-03-10', 20.50, 27.50, 'Fontana',  true),
  ('e-015','sonoma-senior',     'Caregiver',           'Healthcare',    '1st (6a-2p)',  date '2026-05-11', 23.00, 31.00, 'Santa Rosa',true),
  ('e-016','fabfitfun',         'Pick / Pack',         'Fulfillment',   '1st (6a-2p)',  date '2026-05-18', 22.00, 30.00, 'Chino',    true),
  ('e-017','valley-foods',      'Production Associate','Manufacturing', '1st (6a-2p)',  date '2026-05-20', 21.00, 28.00, 'Modesto',  true),
  ('e-018','fafixon',           'Forklift Driver',     'Warehouse',     '2nd (2p-10p)', date '2026-05-22', 23.50, 31.00, 'Stockton', true),
  ('e-019','abc-logistics',     'Forklift Driver',     'Warehouse',     '1st (6a-2p)',  date '2023-08-14', 24.00, 32.00, 'Tracy',    false),
  ('e-020','metro-distribution','Pick / Pack',         'Warehouse',     '2nd (2p-10p)', date '2024-05-06', 21.50, 28.50, 'Sacramento',false)
) as a(legacy_id, client_slug, position, department, shift, start_date, hourly_rate, bill_rate, branch, active)
join employees e on e.legacy_id = a.legacy_id
join clients c on c.slug = a.client_slug;

-- ---------- candidates (every ATS pipeline stage) -----------------------

insert into candidates (full_name, email, phone, city, applied_for, source, applied_at, experience_years, certifications, status, recruiter, notes, criteria, score, client_id, promoted_employee_id) values
  ('Aisha Bennett','aisha.bennett@example.com','(415) 555-0211','San Rafael, CA','Forklift Driver · Warehouse','LinkedIn',current_date - 3,4.5,
    array['Forklift Cert','OSHA-10'],'applied','Leangel',
    'Heard about us from a cousin at ABC. Worth a phone screen this week.',
    '[]'::jsonb, null, (select id from clients where slug='abc-logistics'), null),
  ('Tomas Reyes','tomas.reyes@example.com','(209) 555-0410','Manteca, CA','Warehouse Associate · Warehouse','Indeed',current_date - 2,1.5,
    array['OSHA-10'],'applied','Rocio',
    'Entry level but eager. Available immediately.',
    '[]'::jsonb, null, (select id from clients where slug='metro-distribution'), null),
  ('Daniel Ortega','daniel.ortega@example.com','(707) 555-0188','Petaluma, CA','Senior Caregiver · Healthcare','Referral · Priya Anand',current_date - 8,6.0,
    array['CNA · CA Active','BLS / CPR','HHA Certified','Bilingual ES/EN'],'screening','Rocio',
    'The kind of caregiver families ask for by name. Priya vouched personally.',
    '[
      {"key":"experience","label":"Relevant Experience","sub":"Years and depth in role","weight":20,"value":88,"note":"6 yrs across 2 senior-living facilities"},
      {"key":"skills","label":"Hard Skills","sub":"Certifications, technical fit","weight":20,"value":92,"note":"CNA + HHA + BLS - all current"},
      {"key":"soft","label":"Communication","sub":"Warmth, clarity, listening","weight":15,"value":95,"note":"Bilingual; exceptional in interview"},
      {"key":"reliability","label":"Reliability","sub":"References, attendance history","weight":20,"value":84,"note":"2 strong refs · 1 outstanding callback"},
      {"key":"culture","label":"Culture Fit","sub":"Client environment alignment","weight":15,"value":90,"note":"Sonoma Senior Living shortlist match"},
      {"key":"flex","label":"Schedule Flexibility","sub":"Shifts, weekends, on-call","weight":10,"value":70,"note":"Weekdays preferred · open to Sat AM"}
    ]'::jsonb, 88.55, (select id from clients where slug='sonoma-senior'), null),
  ('Vanessa Cole','vanessa.cole@example.com','(707) 555-0322','Windsor, CA','Front Desk Agent · Hospitality','Company Website',current_date - 6,3.5,
    array['Hospitality Cert'],'screening','Leangel',
    'Hotel front-desk background. Phone screen done; reference checks underway.',
    '[]'::jsonb, null, (select id from clients where slug='pacific-vines'), null),
  ('Trevor Quinn','trevor.quinn@example.com','(209) 555-0166','Manteca, CA','Inventory Control · Warehouse','Indeed',current_date - 12,2.0,
    array['OSHA-10','RF Scanner'],'interview','Rocio',
    'Strong on cycle counts. Onsite interview at Fafixon scheduled Tuesday.',
    '[
      {"key":"experience","label":"Relevant Experience","sub":"Years and depth in role","weight":20,"value":72,"note":"2 yrs RF scanning at a 3PL"},
      {"key":"skills","label":"Hard Skills","sub":"Certifications, technical fit","weight":20,"value":80,"note":"OSHA-10 current; RF proficient"},
      {"key":"soft","label":"Communication","sub":"Warmth, clarity, listening","weight":15,"value":75,"note":"Reserved but clear"},
      {"key":"reliability","label":"Reliability","sub":"References, attendance history","weight":20,"value":85,"note":"Clean attendance per last employer"},
      {"key":"culture","label":"Culture Fit","sub":"Client environment alignment","weight":15,"value":78,"note":"Good fit for Fafixon pace"},
      {"key":"flex","label":"Schedule Flexibility","sub":"Shifts, weekends, on-call","weight":10,"value":90,"note":"Open to any shift"}
    ]'::jsonb, 79.65, (select id from clients where slug='fafixon'), null),
  ('Keisha Monroe','keisha.monroe@example.com','(707) 555-0455','Santa Rosa, CA','Banquet Server · Hospitality','Referral · Marcus Webb',current_date - 9,5.0,
    array['Food Handler'],'interview','Leangel',
    'Marcus referred her. Working interview at a Pacific Vines event this weekend.',
    '[]'::jsonb, null, (select id from clients where slug='pacific-vines'), null),
  ('Marisol Cruz','marisol.cruz@example.com','(626) 555-0142','El Monte, CA','Pick / Pack · Fulfillment','Indeed',current_date - 5,3.0,
    array['OSHA-10'],'offer','Rocio',
    'Verbal offer extended for FabFitFun second shift. Awaiting signed offer letter.',
    '[]'::jsonb, null, (select id from clients where slug='fabfitfun'), null),
  ('Andre Foster','andre.foster@example.com','(916) 555-0533','Elk Grove, CA','Shift Lead · Warehouse','LinkedIn',current_date - 7,7.5,
    array['OSHA-30','Lean Six Sigma'],'offer','Leangel',
    'Strong lead candidate for Metro. Offer letter sent; negotiating start date.',
    '[]'::jsonb, null, (select id from clients where slug='metro-distribution'), null),
  ('Priya Anand','priya.anand@example.com','(415) 555-0126','Petaluma, CA','Caregiver · Healthcare','Referral',current_date - 24,5.5,
    array['CNA · CA Active','BLS / CPR'],'hired','Leangel',
    'Hired and converted to employee e-015. Onboarding in progress.',
    '[]'::jsonb, null, (select id from clients where slug='sonoma-senior'), (select id from employees where legacy_id='e-015')),
  ('Rashad Coleman','rashad.coleman@example.com','(510) 555-0177','Hayward, CA','Pick / Pack · Fulfillment','Indeed',current_date - 17,2.5,
    array['OSHA-10'],'hired','Rocio',
    'Hired and converted to employee e-016. Started this week.',
    '[]'::jsonb, null, (select id from clients where slug='fabfitfun'), (select id from employees where legacy_id='e-016')),
  ('Brandon Pike','brandon.pike@example.com','(209) 555-0644','Lodi, CA','Forklift Driver · Warehouse','Indeed',current_date - 15,3.0,
    array['Forklift Cert'],'rejected','Rocio',
    'Did not clear the client background check requirement. Not moving forward.',
    '[]'::jsonb, null, (select id from clients where slug='fafixon'), null),
  ('Cynthia Vance','cynthia.vance@example.com','(916) 555-0755','Roseville, CA','Inventory Control · Warehouse','Walk-in',current_date - 11,4.0,
    array['RF Scanner'],'rejected','Leangel',
    'Withdrew — accepted another offer before our interview stage.',
    '[]'::jsonb, null, null, null);

-- ---------- attendance (last 3 weeks, demo pattern) ---------------------

insert into attendance_entries (employee_id, client_id, date, status, check_in, check_out, notes)
select
  ea.employee_id, ea.client_id, d::date,
  case
    when (extract(day from d)::int + ea.hourly_rate::int) % 17 = 0 then 'no_show'::attendance_status
    when (extract(day from d)::int + ea.hourly_rate::int) % 11 = 0 then 'missed'::attendance_status
    when (extract(day from d)::int + ea.hourly_rate::int) %  7 = 0 then 'late'::attendance_status
    when (extract(day from d)::int + ea.hourly_rate::int) % 13 = 0 then 'excused'::attendance_status
    else 'present'::attendance_status
  end,
  case when (extract(day from d)::int + ea.hourly_rate::int) % 7 = 0 then time '06:12' else time '05:58' end,
  time '14:30',
  null
from employee_assignments ea
join employees e on e.id = ea.employee_id
cross join generate_series(current_date - interval '21 day', current_date - interval '1 day', interval '1 day') as d
where extract(dow from d) not in (0, 6)
  and ea.active = true
  and e.status = 'active';

-- ---------- onboarding checklist (13-item template) ---------------------

with items(key, label, detail, category, ord) as (
  values
    ('personal_info',     'Employee personal information received',            'Verify ID, address, emergency contacts on file',          'Documentation', 1),
    ('welcome_email',     'Welcome letter sent by email',                      'Generated from template; sent to personal email',         'Documentation', 2),
    ('welcome_pandadocs', 'Welcome letter via PandaDocs',                      'Signature required',                                      'Documentation', 3),
    ('agreement',         'Agreement and Expectations document signed',        'Signature required; varies by client',                    'Compliance',    4),
    ('orientation',       'Orientation scheduled',                             'Date, time, person in charge',                            'Training',      5),
    ('agreement_copy',    'Copy of agreements + orientation sent to employee', 'PDFs forwarded after signing + orientation confirmation', 'Documentation', 6),
    ('background',        'Background check completed',                        'Client-dependent; confirm whether client requires it',    'Compliance',    7),
    ('badge_id',          'Badge ID issued',                                   'Site badge issued and confirmed in hand',                 'Equipment',     8),
    ('clock_setup',       'Clock setup',                                       'Time clock provisioned at site',                          'Equipment',     9),
    ('uattend_register',  'UAttend registration',                              'Employee registered in UAttend portal',                   'Equipment',    10),
    ('peo_uattend',       'PEO ID assigned in UAttend',                        'PEO identifier mapped to UAttend record',                 'Equipment',    11),
    ('sexual_harassment', 'Sexual harassment training completed',              'In-person OR online certificate on file',                 'Compliance',   12),
    ('active_folder',     'Active employee folder created',                    'All signed docs uploaded to the employee folder',         'Documentation',13)
)
insert into onboarding_checklist_items (employee_id, key, label, detail, category, status, done_on, notes)
select
  e.id, i.key, i.label, i.detail, i.category::onboarding_category,
  case
    when e.status = 'active' then 'done'
    when e.legacy_id = 'e-015' and i.ord <= 9 then 'done'
    when e.legacy_id = 'e-015' and i.ord = 10 then 'in_progress'
    when e.legacy_id = 'e-016' and i.ord <= 5 then 'done'
    when e.legacy_id = 'e-016' and i.ord = 6 then 'in_progress'
    when e.legacy_id = 'e-017' and i.ord <= 3 then 'done'
    when e.legacy_id = 'e-017' and i.ord = 4 then 'in_progress'
    when e.legacy_id = 'e-018' and i.ord <= 2 then 'done'
    when e.legacy_id = 'e-018' and i.ord = 3 then 'in_progress'
    else 'not_started'
  end::onboarding_status,
  case when e.status = 'active' then (e.hire_date + interval '5 day')::date else null end,
  case when e.legacy_id = 'e-015' and i.ord = 10 then 'Waiting on PEO portal access from corporate.'
       when e.legacy_id = 'e-018' and i.ord = 3 then 'PandaDocs link sent this morning.'
       else null end
from employees e
cross join items i
where e.status in ('active','onboarding');

-- ---------- onboarding documents ----------------------------------------

insert into onboarding_documents (employee_id, name, received, received_on)
select e.id, d.name,
  case when e.status = 'active' then true
       when e.status = 'onboarding' and d.ord <= 2 then true
       else false end,
  case when e.status = 'active' then (e.hire_date + interval '3 day')::date
       when e.status = 'onboarding' and d.ord <= 2 then current_date - 1
       else null end
from employees e
cross join (values
  ('Driver''s License', 1),
  ('Social Security Card', 2),
  ('Direct Deposit Form', 3),
  ('Emergency Contact', 4),
  ('I-9 Supporting Docs', 5)
) as d(name, ord)
where e.status in ('active','onboarding');

-- ---------- welcome letter drafts ---------------------------------------

insert into welcome_letter_drafts (employee_id, body, sent_at) values
  ((select id from employees where legacy_id='e-015'),
   'Dear Priya, welcome to the Driven Talent family! We are thrilled to have you join Sonoma Senior Living as a Caregiver. Your orientation is set and your onboarding team is here for anything you need. — The Driven Talent Team',
   now() - interval '11 day'),
  ((select id from employees where legacy_id='e-016'),
   'Dear Rashad, welcome aboard! We are excited for you to start as a Pick / Pack associate at FabFitFun. Please review the attached agreements and we will see you at orientation. — The Driven Talent Team',
   now() - interval '4 day'),
  ((select id from employees where legacy_id='e-017'),
   'Dear Emily, welcome to Driven Talent! We are glad to have you joining Valley Fresh Foods. Your welcome packet is on the way. — The Driven Talent Team',
   null),
  ((select id from employees where legacy_id='e-018'),
   'Dear Darnell, welcome to the team! We are looking forward to your first day at Fafixon. Orientation details to follow shortly. — The Driven Talent Team',
   null);

-- ---------- contacts ----------------------------------------------------

insert into contacts (full_name, email, phone, company, type, source, notes, candidate_id, client_id) values
  ('Maya Robinson',  'maya.robinson@example.com',  '(209) 555-0820', null,                   'job_seeker','driven-talent.com','Applied via careers form for Warehouse Associate.', null, null),
  ('Derek Olsen',    'derek.olsen@example.com',    '(916) 555-0831', null,                   'job_seeker','driven-talent.com','Applied via careers form for Forklift Driver.',     null, null),
  ('Sofia Marquez',  'sofia.marquez@example.com',  '(707) 555-0842', null,                   'job_seeker','driven-talent.com','Applied via careers form for Caregiver.',           null, null),
  ('James Whitfield','james.whitfield@example.com','(209) 555-0853', null,                   'job_seeker','driven-talent.com','Applied via careers form for Pick / Pack.',         null, null),
  ('Hannah Beck',    'hannah.beck@example.com',    '(707) 555-0864', null,                   'job_seeker','driven-talent.com','Applied via careers form for Front Desk Agent.',    null, null),
  ('Luis Cabrera',   'luis.cabrera@example.com',   '(909) 555-0875', null,                   'job_seeker','driven-talent.com','Applied via careers form for Material Handler.',    null, null),
  ('Patricia Nolan', 'patricia@example.com',       '(209) 555-0901', 'Crestline Warehousing','employer',  'Web chat',         'Prospective new account — needs ~12 warehouse staff.', null, null),
  ('Lina Park',      'lina.park@example.com',      '(310) 555-0912', 'FabFitFun',            'employer',  'Email',            'Existing client contact — Q3 headcount planning.',  null, (select id from clients where slug='fabfitfun')),
  ('Sandra Liu',     'sandra@example.com',         '(707) 555-0923', 'Pacific Vines Hotel',  'employer',  'Phone',            'Existing client contact — event staffing requests.', null, (select id from clients where slug='pacific-vines')),
  ('Greg Tanaka',    'greg.tanaka@example.com',    '(209) 555-0934', 'Northbay Cold Storage','employer',  'Referral',         'Warm lead from a current client referral.',         null, null),
  ('Marcus Field',   'marcus.field@example.com',   '(916) 555-0945', null,                   'job_seeker','SMS',              'Texted in asking about caregiver openings.',        null, null),
  ('Renee Whitmore', 'renee.whitmore@example.com', '(415) 555-0956', null,                   'other',     'Web chat',         'General question — not a current fit.',             null, null);

-- ---------- conversations (the Inbox) -----------------------------------

insert into conversations (contact_id, subject, status, assigned_to, channel, created_at) values
  ((select id from contacts where full_name='Maya Robinson'),  'Application — Maya Robinson · Warehouse Associate', 'open',     null,      'application', now() - interval '5 hour'),
  ((select id from contacts where full_name='Derek Olsen'),    'Application — Derek Olsen · Forklift Driver',       'open',     null,      'application', now() - interval '1 day'),
  ((select id from contacts where full_name='Sofia Marquez'),  'Application — Sofia Marquez · Caregiver',           'assigned', 'Rocio',   'application', now() - interval '2 day'),
  ((select id from contacts where full_name='James Whitfield'),'Application — James Whitfield · Pick / Pack',       'open',     null,      'application', now() - interval '3 hour'),
  ((select id from contacts where full_name='Hannah Beck'),    'Application — Hannah Beck · Front Desk Agent',      'open',     null,      'application', now() - interval '8 hour'),
  ((select id from contacts where full_name='Luis Cabrera'),   'Application — Luis Cabrera · Material Handler',     'open',     null,      'application', now() - interval '4 day'),
  ((select id from contacts where full_name='Patricia Nolan'), 'New staffing inquiry — Crestline Warehousing',     'open',     null,      'web_chat',    now() - interval '6 hour'),
  ((select id from contacts where full_name='Lina Park'),      'Q3 headcount planning — FabFitFun',                'assigned', 'Roxanna', 'email',       now() - interval '2 day'),
  ((select id from contacts where full_name='Marcus Field'),   'Question about Caregiver openings',                'resolved', 'Leangel', 'sms',         now() - interval '6 day'),
  ((select id from contacts where full_name='Renee Whitmore'), 'General question',                                 'archived', 'Leangel', 'web_chat',    now() - interval '9 day');

-- ---------- messages ----------------------------------------------------

insert into messages (conversation_id, sender_type, sender_name, body, read, created_at) values
  ((select id from conversations where subject='Application — Maya Robinson · Warehouse Associate'),'visitor','Maya Robinson','Hi, I just submitted my application for the Warehouse Associate role. I have 2 years of experience and can start right away.', false, now() - interval '5 hour'),
  ((select id from conversations where subject='Application — Derek Olsen · Forklift Driver'),'visitor','Derek Olsen','Application submitted — certified forklift driver, open to any shift.', false, now() - interval '1 day'),
  ((select id from conversations where subject='Application — Sofia Marquez · Caregiver'),'visitor','Sofia Marquez','Submitting my application for the Caregiver position. CNA certified and bilingual.', true, now() - interval '2 day'),
  ((select id from conversations where subject='Application — Sofia Marquez · Caregiver'),'agent','Rocio','Thanks Sofia — reviewing your application now, we will reach out to schedule a phone screen.', true, now() - interval '1 day 20 hour'),
  ((select id from conversations where subject='Application — James Whitfield · Pick / Pack'),'visitor','James Whitfield','Just applied for Pick / Pack. Available immediately for second shift.', false, now() - interval '3 hour'),
  ((select id from conversations where subject='Application — Hannah Beck · Front Desk Agent'),'visitor','Hannah Beck','Applied for the Front Desk Agent role — 4 years hotel front-desk experience.', false, now() - interval '8 hour'),
  ((select id from conversations where subject='Application — Luis Cabrera · Material Handler'),'visitor','Luis Cabrera','asdf asdf buy followers cheap promo link', true, now() - interval '4 day'),
  ((select id from conversations where subject='New staffing inquiry — Crestline Warehousing'),'visitor','Patricia Nolan','Hello — we are opening a new DC in Lathrop and will need around 12 warehouse staff by mid-July. Can someone walk me through your rates?', false, now() - interval '6 hour'),
  ((select id from conversations where subject='Q3 headcount planning — FabFitFun'),'visitor','Lina Park','Sharing our Q3 forecast — we expect to add a third shift in August. Let us set up a planning call.', true, now() - interval '2 day'),
  ((select id from conversations where subject='Q3 headcount planning — FabFitFun'),'agent','Roxanna','Got it Lina — I will send over a couple of times for next week and a draft staffing plan.', true, now() - interval '1 day 18 hour'),
  ((select id from conversations where subject='Question about Caregiver openings'),'visitor','Marcus Field','Do you have any caregiver jobs in the Santa Rosa area?', true, now() - interval '6 day'),
  ((select id from conversations where subject='Question about Caregiver openings'),'agent','Leangel','Yes! We have openings at Sonoma Senior Living — I sent you the careers link to apply. Good luck!', true, now() - interval '6 day' + interval '2 hour'),
  ((select id from conversations where subject='General question'),'visitor','Renee Whitmore','Do you offer remote positions?', true, now() - interval '9 day'),
  ((select id from conversations where subject='General question'),'agent','Leangel','At this time all of our roles are on-site. Thanks for reaching out!', true, now() - interval '9 day' + interval '1 hour');

-- ---------- application intakes (paired with the Inbox) -----------------

insert into application_intakes (full_name, email, phone, city, position_of_interest, experience_years, resume_url, cover_letter, source, user_agent, ip_hash, intake_payload, status, conversation_id, reviewed_by, reviewed_at) values
  ('Maya Robinson','maya.robinson@example.com','(209) 555-0820','Lathrop, CA','Warehouse Associate',2.0,null,
   'I am excited to apply and can start immediately.','driven-talent.com','Mozilla/5.0 (Macintosh)','hash_8a1f',
   '{"first_name":"Maya","last_name":"Robinson","desired_pay":"$20/hr","shift_pref":"any"}'::jsonb,
   'new',(select id from conversations where subject='Application — Maya Robinson · Warehouse Associate'),null,null),
  ('Derek Olsen','derek.olsen@example.com','(916) 555-0831','Elk Grove, CA','Forklift Driver',4.0,null,
   'Certified forklift operator, 4 years in distribution.','driven-talent.com','Mozilla/5.0 (Windows NT 10.0)','hash_3c7d',
   '{"first_name":"Derek","last_name":"Olsen","certs":["Forklift"],"shift_pref":"any"}'::jsonb,
   'new',(select id from conversations where subject='Application — Derek Olsen · Forklift Driver'),null,null),
  ('Sofia Marquez','sofia.marquez@example.com','(707) 555-0842','Rohnert Park, CA','Caregiver',5.5,null,
   'CNA certified, bilingual English/Spanish, passionate about senior care.','driven-talent.com','Mozilla/5.0 (iPhone)','hash_9e2b',
   '{"first_name":"Sofia","last_name":"Marquez","certs":["CNA","BLS"],"languages":["EN","ES"]}'::jsonb,
   'reviewed',(select id from conversations where subject='Application — Sofia Marquez · Caregiver'),'Rocio',now() - interval '1 day 20 hour'),
  ('James Whitfield','james.whitfield@example.com','(209) 555-0853','Stockton, CA','Pick / Pack',1.0,null,
   'Available immediately, eager to learn.','driven-talent.com','Mozilla/5.0 (Android)','hash_5f4a',
   '{"first_name":"James","last_name":"Whitfield","shift_pref":"2nd"}'::jsonb,
   'new',(select id from conversations where subject='Application — James Whitfield · Pick / Pack'),null,null),
  ('Hannah Beck','hannah.beck@example.com','(707) 555-0864','Healdsburg, CA','Front Desk Agent',4.0,null,
   'Four years of hotel front-desk experience, strong guest-service skills.','driven-talent.com','Mozilla/5.0 (Macintosh)','hash_2d8c',
   '{"first_name":"Hannah","last_name":"Beck","experience_years":4}'::jsonb,
   'new',(select id from conversations where subject='Application — Hannah Beck · Front Desk Agent'),null,null),
  ('Luis Cabrera','luis.cabrera@example.com','(909) 555-0875','Rialto, CA','Material Handler',null,null,
   'buy followers cheap promo link','driven-talent.com','python-requests/2.31','hash_0000',
   '{"raw":"asdf asdf buy followers cheap promo link"}'::jsonb,
   'spam',(select id from conversations where subject='Application — Luis Cabrera · Material Handler'),'Leangel',now() - interval '3 day');

-- ---------- inbound calls -----------------------------------------------

insert into inbound_calls (caller_name, caller_phone, caller_email, position_of_interest, called_at, taken_by, notes, follow_up_status, follow_up_due, converted_candidate_id) values
  ('Olivia Grant',  '(209) 555-1010','olivia.grant@example.com', 'Forklift Driver',   now() - interval '3 hour','Rocio',  'Strong phone presence — asked her to apply online.',          'new',           current_date + 2, null),
  ('Marcus DeLeon', '(916) 555-1021',null,                       'Warehouse general', now() - interval '1 day', 'Leangel','Left details; will call back to schedule a screen.',          'contacted',     current_date + 1, null),
  ('Tina Alvarez',  '(707) 555-1032','tina.alvarez@example.com', 'Caregiver',         now() - interval '2 day', 'Rocio',  'No answer on callback — left a voicemail.',                   'left_voicemail',current_date,     null),
  ('Brandon Pike',  '(209) 555-0644',null,                       'Forklift Driver',   now() - interval '6 day', 'Leangel','Followed up — candidate did not clear background; dropped.',   'dropped',       null,             null),
  ('Yuki Tanaka',   '(415) 555-1054','yuki.tanaka@example.com',  'Pick / Pack',       now() - interval '4 day', 'Rocio',  'Converted — created candidate record and moved to applied.',   'converted',     null,             (select id from candidates where email='aisha.bennett@example.com')),
  ('Sam Porter',    '(909) 555-1065',null,                       'Material Handler',  now() - interval '5 hour','Leangel','New inbound — needs a callback this week.',                   'new',           current_date + 3, null),
  ('Gloria Mendez', '(707) 555-1076','gloria.mendez@example.com','Front Desk Agent',  now() - interval '2 day', 'Rocio',  'Interested in Pacific Vines — sent careers link.',            'contacted',     current_date + 1, null),
  ('Derrick Hall',  '(209) 555-1087',null,                       'Warehouse Associate',now()- interval '7 day', 'Leangel','Converted to a candidate after phone screen.',                'converted',     null,             (select id from candidates where email='tomas.reyes@example.com'));

-- ---------- positions (vacancy tracker) ---------------------------------

insert into positions (client_id, role_title, department, shift, pay_rate, pay_rate_unit, headcount, filled_count, requirements, recruiting_notes, status, opened_at, needed_by, filled_at, recruiter)
select c.id, p.role_title, p.department, p.shift, p.pay_rate, 'hourly', p.headcount, p.filled_count,
       p.requirements, p.recruiting_notes, p.status::position_status, p.opened_at, p.needed_by, p.filled_at, p.recruiter
from (values
  ('fafixon',           'Forklift Driver',          'Warehouse',     '1st (6a-2p)',  24.50, 3, 1,'Forklift cert, 1+ yr experience, OSHA-10 preferred','Two strong leads in screening. Need two more bodies.','open',      current_date - 18, current_date + 14, null,            'Rocio'),
  ('abc-logistics',     'Warehouse Inventory Lead', 'Inventory',     '1st (6a-2p)',  28.00, 1, 0,'RF scanner, cycle-count experience, lead background','Sourcing now — no qualified candidates yet.','open',                current_date - 9,  current_date + 21, null,            'Leangel'),
  ('metro-distribution','Pick / Pack',              'Warehouse',     '2nd (2p-10p)', 21.50, 5, 2,'Able to lift 40 lbs, reliable transportation','Backfilling peak season. Two placed; ongoing pipeline.','open',          current_date - 25, current_date + 7,  null,            'Rocio'),
  ('pacific-vines',     'Banquet Server',           'Hospitality',   '2nd (2p-10p)', 19.50, 2, 1,'Food handler card, weekend availability','One placed; second slot open for event season.','open',                       current_date - 14, current_date + 10, null,            'Leangel'),
  ('fabfitfun',         'Pick / Pack (2nd Shift)',  'Fulfillment',   '2nd (2p-10p)', 22.00, 2, 2,'Able to lift 40 lbs, OSHA-10 preferred','Filled — both placements active.','filled',                                  current_date - 30, current_date - 5,  current_date - 6,'Rocio'),
  ('sonoma-senior',     'Caregiver',                'Healthcare',    '1st (6a-2p)',  23.00, 2, 1,'CNA or HHA, BLS/CPR, background check required','One placed (Priya). One slot open — Daniel Ortega in screening.','open',     current_date - 28, current_date + 5,  null,            'Leangel'),
  ('valley-foods',      'Production Associate',     'Manufacturing', '1st (6a-2p)',  21.00, 3, 1,'Food manufacturing experience a plus, GMP awareness','One placed; line ramp-up needs two more.','open',                       current_date - 12, current_date + 18, null,            'Leangel'),
  ('isc',               'Material Handler',         'Warehouse',     '2nd (2p-10p)', 20.50, 2, 0,'Able to lift 50 lbs, forklift cert preferred','Client paused the req — revisit next month.','on_hold',                    current_date - 20, null,              null,            'Rocio'),
  ('pacific-vines',     'Sous Chef',                'Hospitality',   '1st (6a-2p)',  31.00, 1, 0,'5+ yrs kitchen, culinary credential','Cancelled — client filled internally.','cancelled',                                   current_date - 35, null,              null,            'Leangel'),
  ('abc-logistics',     'Forklift Driver (Night)',  'Warehouse',     '3rd (10p-6a)', 25.50, 2, 0,'Forklift cert, overnight availability','New req — just opened, sourcing begins this week.','open',                       current_date - 2,  current_date + 30, null,            'Rocio')
) as p(client_slug, role_title, department, shift, pay_rate, headcount, filled_count, requirements, recruiting_notes, status, opened_at, needed_by, filled_at, recruiter)
join clients c on c.slug = p.client_slug;

-- ---------- position placements -----------------------------------------

insert into position_placements (position_id, employee_id, candidate_id, placed_at, notes)
select pos.id, e.id, cand.id, pl.placed_at, pl.notes
from (values
  ('fafixon',           'Forklift Driver',         'e-001', null,                            current_date - 12, 'Existing employee picked up the new req.'),
  ('metro-distribution','Pick / Pack',             'e-006', null,                            current_date - 20, 'Placed for peak season.'),
  ('metro-distribution','Pick / Pack',             'e-012', null,                            current_date - 15, 'Second placement on the same req.'),
  ('pacific-vines',     'Banquet Server',          'e-008', null,                            current_date - 10, 'Placed ahead of event season.'),
  ('fabfitfun',         'Pick / Pack (2nd Shift)', 'e-013', null,                            current_date - 8,  'Req fully filled.'),
  ('fabfitfun',         'Pick / Pack (2nd Shift)', 'e-016', 'rashad.coleman@example.com',    current_date - 6,  'Hired candidate converted and placed.'),
  ('sonoma-senior',     'Caregiver',               'e-015', 'priya.anand@example.com',       current_date - 13, 'Hired candidate converted and placed.'),
  ('valley-foods',      'Production Associate',    'e-007', null,                            current_date - 9,  'Placed on Line 2 ramp-up.')
) as pl(client_slug, role_title, legacy_id, cand_email, placed_at, notes)
join clients c on c.slug = pl.client_slug
join positions pos on pos.client_id = c.id and pos.role_title = pl.role_title
join employees e on e.legacy_id = pl.legacy_id
left join candidates cand on cand.email = pl.cand_email;

-- ---------- calendar: birthdays (track 1 of 4) --------------------------
-- (holidays — track 2 — are seeded by 0003_calendar.sql)

insert into calendar_events (kind, title, event_date, all_day, employee_id, assignee_name, created_by)
select 'birthday', e.full_name || ' — Birthday',
  make_date(2026, extract(month from e.birthday)::int, extract(day from e.birthday)::int),
  true, e.id, 'HR', 'system'
from employees e
where e.birthday is not null and e.status <> 'inactive';

-- ---------- calendar: social posts (track 3 of 4) -----------------------

insert into calendar_events (kind, title, description, event_date, all_day, assignee_name, link_url, created_by) values
  ('social_post','Instagram — Hiring spotlight: Warehouse roles','Carousel post featuring open warehouse reqs.','2026-05-26',true,'Marketing','https://example.com/draft/ig-warehouse','Roxanna'),
  ('social_post','LinkedIn — Client success story: Pacific Vines','Case study on event staffing wins.','2026-05-29',true,'Marketing','https://example.com/draft/li-pacificvines','Roxanna'),
  ('social_post','Blog post — Safety Week recap','Recap of the May safety training push.','2026-06-02',true,'Marketing',null,'Roxanna'),
  ('social_post','Instagram — Meet the team: Recruiters','Short reel introducing Rocio and Leangel.','2026-06-09',true,'Marketing',null,'Roxanna'),
  ('social_post','Newsletter — June openings digest','Monthly email blast of active openings.','2026-06-15',true,'Marketing',null,'Roxanna'),
  ('social_post','TikTok — Day in the life: Forklift driver','Short-form video at a client site.','2026-06-22',true,'Marketing',null,'Roxanna');

-- ---------- calendar: custom events (track 4 of 4) ----------------------

insert into calendar_events (kind, title, description, event_date, start_time, end_time, all_day, location, assignee_name, client_id, created_by) values
  ('custom','Interview — Trevor Quinn (Inventory Control)','Onsite interview for the Fafixon inventory req.','2026-05-26','10:00','10:45',false,'Fafixon — Stockton','Rocio',(select id from clients where slug='fafixon'),'Rocio'),
  ('custom','Orientation — Darnell Pierce','Day-one orientation for new hire e-018.','2026-05-25','08:00','12:00',false,'Fafixon — Stockton','Estefany',(select id from clients where slug='fafixon'),'Estefany'),
  ('custom','Team standup','Weekly ops sync.','2026-05-25','09:00','09:15',false,'Driven Talent HQ','All Staff',null,'Roxanna'),
  ('custom','Client check-in — FabFitFun','Q3 headcount planning call with Lina Park.','2026-05-27','14:00','15:00',false,'Zoom','Roxanna',(select id from clients where slug='fabfitfun'),'Roxanna'),
  ('custom','Interview — Keisha Monroe (Banquet Server)','Working interview at a Pacific Vines event.','2026-05-28','11:00','11:45',false,'Pacific Vines — Healdsburg','Leangel',(select id from clients where slug='pacific-vines'),'Leangel'),
  ('custom','Safety training — All ISC staff','Quarterly safety refresher per the Injury & Incident SOP.','2026-06-03','13:00','15:00',false,'ISC — Fontana','Estefany',(select id from clients where slug='isc'),'Estefany'),
  ('custom','Payroll close — W1 June','Audit and close the first June pay period.','2026-06-05',null,null,true,null,'Roxanna',null,'Roxanna'),
  ('custom','Quarterly business review — ABC Logistics','QBR with Marcus Tian and the ABC ops team.','2026-06-11','10:00','11:30',false,'ABC Logistics — Tracy','Roxanna',(select id from clients where slug='abc-logistics'),'Roxanna');

-- ---------- payroll periods ---------------------------------------------

insert into payroll_periods (start_date, end_date, status, invoice_date, approved_by, approved_at, notes) values
  ((date_trunc('week', current_date) - interval '2 week')::date,
   (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
   'approved',
   (date_trunc('week', current_date) - interval '1 week' + interval '3 day')::date,
   'Roxanna', now() - interval '8 day',
   'Closed, audited and invoiced.'),
  ((date_trunc('week', current_date) - interval '1 week')::date,
   (date_trunc('week', current_date) - interval '1 day')::date,
   'audited',
   (date_trunc('week', current_date) + interval '3 day')::date,
   null, null,
   'Audit complete; awaiting final client approvals.'),
  ((date_trunc('week', current_date))::date,
   (date_trunc('week', current_date) + interval '6 day')::date,
   'open', null, null, null,
   'Current pay period — timecards being entered.');

-- ---------- timecards (one per active assignment per period) ------------

with periods as (
  select id,
         start_date as ws,
         case status when 'approved' then 'closed'
                     when 'audited'  then 'audited'
                     else 'open' end as kind
  from payroll_periods
),
aa as (
  select ea.employee_id, ea.client_id, ea.hourly_rate,
         row_number() over (order by ea.employee_id, ea.client_id) as rn
  from employee_assignments ea
  join employees e on e.id = ea.employee_id
  where ea.active = true and e.status = 'active'
)
insert into timecards
  (employee_id, client_id, week_start, days, reg_hours, ot_hours, holiday_hours,
   sick_hours, hourly_rate, status, submitted_at, approved_by, approved_at,
   payroll_period_id, flags)
select
  aa.employee_id, aa.client_id, p.ws,
  case when p.kind = 'open' then
    '{"mon":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":true},
      "tue":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":true},
      "wed":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":false},
      "thu":{"regular":0,"overtime":0,"holiday":0,"in":null,"out":null,"locked":false},
      "fri":{"regular":0,"overtime":0,"holiday":0,"in":null,"out":null,"locked":false},
      "sat":{"regular":0,"overtime":0,"holiday":0,"in":null,"out":null,"locked":false},
      "sun":{"regular":0,"overtime":0,"holiday":0,"in":null,"out":null,"locked":false}}'::jsonb
  else
    '{"mon":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":true},
      "tue":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":true},
      "wed":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":true},
      "thu":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":true},
      "fri":{"regular":8.0,"overtime":0,"holiday":0,"in":"06:00","out":"14:30","locked":true},
      "sat":{"regular":0,"overtime":0,"holiday":0,"in":null,"out":null,"locked":true},
      "sun":{"regular":0,"overtime":0,"holiday":0,"in":null,"out":null,"locked":true}}'::jsonb
  end,
  case when p.kind = 'open' then 24.0 else 40.0 end,
  case when p.kind = 'open' then 0.0
       when aa.rn % 3 = 0 then 4.0
       when aa.rn % 3 = 1 then 2.0
       else 0.0 end,
  0,
  case when p.kind = 'audited' and aa.rn % 5 = 0 then 8.0 else 0.0 end,
  aa.hourly_rate,
  (case
     when p.kind = 'closed'  then 'approved'
     when p.kind = 'audited' then (case when aa.rn % 3 = 0 then 'submitted' else 'approved' end)
     else (case when aa.rn % 2 = 0 then 'submitted' else 'draft' end)
   end)::timecard_status,
  case
     when p.kind in ('closed','audited') then (p.ws + interval '6 day' + interval '17 hour')
     when p.kind = 'open' and aa.rn % 2 = 0 then now() - interval '8 hour'
     else null
   end,
  case when p.kind = 'closed' or (p.kind = 'audited' and aa.rn % 3 <> 0) then 'Roxanna' else null end,
  case when p.kind = 'closed' or (p.kind = 'audited' and aa.rn % 3 <> 0) then (p.ws + interval '8 day') else null end,
  p.id,
  case when aa.rn % 7 = 0 then '{"missed_punch": true, "punch_day": "wed"}'::jsonb else '{}'::jsonb end
from aa cross join periods p;

-- ---------- sick time entries -------------------------------------------

insert into sick_time_entries (employee_id, entry_date, entry_type, hours, notes, created_by)
select e.id, s.entry_date, s.entry_type::sick_entry_type, s.hours, s.notes, 'Estefany'
from (values
  ('e-001', current_date - 35,'accrual',   2.0,'Quarterly sick accrual.'),
  ('e-001', current_date - 12,'usage',     8.0,'Sick day — flu.'),
  ('e-002', current_date - 35,'accrual',   3.0,'Quarterly sick accrual.'),
  ('e-002', current_date - 20,'usage',     4.0,'Half day — medical appointment.'),
  ('e-003', current_date - 35,'accrual',   2.0,'Quarterly sick accrual.'),
  ('e-003', current_date - 6, 'usage',     8.0,'Sick day.'),
  ('e-004', current_date - 18,'usage',     8.0,'Sick day — called out.'),
  ('e-005', current_date - 35,'accrual',   2.5,'Quarterly sick accrual.'),
  ('e-005', current_date - 6, 'usage',     8.0,'Sent home — heat exhaustion (see incident).'),
  ('e-006', current_date - 35,'accrual',   1.5,'Quarterly sick accrual.'),
  ('e-007', current_date - 35,'accrual',   3.0,'Quarterly sick accrual.'),
  ('e-008', current_date - 22,'usage',     4.0,'Half day — family matter.'),
  ('e-010', current_date - 40,'adjustment',4.0,'Carryover correction from prior year.'),
  ('e-013', current_date - 9, 'usage',     8.0,'Sick day.')
) as s(legacy_id, entry_date, entry_type, hours, notes)
join employees e on e.legacy_id = s.legacy_id;

-- ---------- leave of absence requests -----------------------------------

insert into leave_of_absence_requests (employee_id, type, status, requested_at, start_date, end_date, return_date, reason, protected, paid, approved_by, approved_at, notes)
select e.id, l.type::loa_type, l.status::loa_status, l.requested_at, l.start_date, l.end_date, l.return_date,
       l.reason, l.protected, l.paid, l.approved_by, l.approved_at, l.notes
from (values
  ('e-002','cfra',      'active',   current_date - 28, current_date - 20, current_date + 40, null,              'Bonding leave following the birth of a child.', true,  false,'Estefany', now() - interval '24 day','CFRA protected — job restoration on return.'),
  ('e-005','pdl',       'approved', current_date - 10, current_date + 14, current_date + 90, null,              'Pregnancy disability leave.',                   true,  false,'Estefany', now() - interval '7 day', 'PDL approved; coordinate coverage at Pacific Vines.'),
  ('e-010','personal',  'requested',current_date - 2,  current_date + 30, current_date + 44, null,              'Family relocation assistance.',                 false, false,null,       null,                     'Pending manager review.'),
  ('e-013','bereavement','returned',current_date - 16, current_date - 15, current_date - 11, current_date - 10, 'Death in the immediate family.',                false, true, 'Estefany', now() - interval '15 day','Returned to work as scheduled.'),
  ('e-019','medical',   'cancelled',current_date - 70, current_date - 60, current_date - 30, null,              'Surgery recovery — employee since separated.',  false, false,null,       null,                     'Cancelled — employee separated from the company.')
) as l(legacy_id, type, status, requested_at, start_date, end_date, return_date, reason, protected, paid, approved_by, approved_at, notes)
join employees e on e.legacy_id = l.legacy_id;

-- ---------- safety incidents --------------------------------------------

insert into safety_incidents
  (employee_id, client_id, incident_date, incident_time, type, severity, status, body_part, location,
   description, what_happened, immediate_treatment, witnesses,
   s1_triage_called_at, safety_manager_notified_at, client_notified_at, dwc1_sent_at, refusal_signed_at,
   reported_by, follow_up)
select e.id, c.id, s.incident_date, s.incident_time, s.type::incident_type, s.severity::incident_severity,
       s.status::incident_status, s.body_part, s.location, s.description, s.what_happened, s.immediate_treatment,
       s.witnesses::jsonb, s.s1_triage, s.safety_notified, s.client_notified, s.dwc1_sent, s.refusal_signed,
       s.reported_by, s.follow_up
from (values
  ('e-004','abc-logistics', current_date - 9, time '09:40','injury','recordable','investigating','Lower back','ABC Logistics — Dock 3',
    'Employee strained lower back lifting a pallet without a team lift.',
    'Lifted an estimated 60 lb carton solo; felt a pull in the lower back.',
    'Ice applied on site; advised to see occupational clinic.',
    '[{"name":"Hector Salinas","contact":"(209) 555-0190"}]',
    now() - interval '9 day' + interval '20 minute', now() - interval '9 day' + interval '35 minute',
    now() - interval '9 day' + interval '1 hour', now() - interval '8 day', null,
    'Hector Salinas','Awaiting clinic report; retrain crew on team-lift policy.'),
  ('e-006','metro-distribution', current_date - 22, time '15:10','near_miss','unknown','resolved',null,'Metro Distribution — Aisle 7',
    'A carton fell from the second rack level; no one was struck.',
    'Improperly stacked carton shifted and fell as a picker passed.',
    'Area cleared; rack re-stacked and inspected.',
    '[]',
    null, now() - interval '22 day' + interval '30 minute', now() - interval '22 day' + interval '2 hour', null, null,
    'Devon Carter','Closed — added to weekly rack-audit checklist.'),
  ('e-009','isc', current_date - 35, time '18:25','injury','first_aid','closed','Left hand','ISC — Pack line 2',
    'Minor laceration to the left hand from a box cutter.',
    'Blade slipped while opening a carton.',
    'Cleaned and bandaged at the first-aid station; declined further care.',
    '[{"name":"Quincy Adams","contact":"(909) 555-0212"}]',
    null, now() - interval '35 day' + interval '15 minute', null, null, now() - interval '35 day' + interval '40 minute',
    'Tanya Brooks','Closed — replaced cutters with safety-blade models.'),
  ('e-001','fafixon', current_date - 3, time '07:15','vehicle','recordable','reported','none','Fafixon — Aisle 4',
    'Forklift contacted a racking upright; minor structural scuff, no injury.',
    'Tight turn at low speed clipped the rack leg.',
    'No injury; equipment and rack inspected.',
    '[]',
    null, now() - interval '3 day' + interval '25 minute', now() - interval '3 day' + interval '50 minute', null, null,
    'Carlos Mendez','Investigation open — review aisle clearance and signage.'),
  ('e-005','pacific-vines', current_date - 6, time '19:50','illness','lost_time','investigating','none','Pacific Vines — Kitchen',
    'Employee experienced heat exhaustion during dinner service.',
    'Prolonged exposure near the line during a hot evening service.',
    'Moved to a cool area, hydrated; sent home for the remainder of the shift.',
    '[{"name":"Aaliyah Brooks","contact":"(707) 555-0166"}]',
    now() - interval '6 day' + interval '10 minute', now() - interval '6 day' + interval '25 minute',
    now() - interval '6 day' + interval '1 hour', null, null,
    'Aaliyah Brooks','Reviewing kitchen ventilation and break cadence with the client.')
) as s(legacy_id, client_slug, incident_date, incident_time, type, severity, status, body_part, location,
       description, what_happened, immediate_treatment, witnesses,
       s1_triage, safety_notified, client_notified, dwc1_sent, refusal_signed, reported_by, follow_up)
join employees e on e.legacy_id = s.legacy_id
join clients c on c.slug = s.client_slug;

-- ---------- disciplinary warnings ---------------------------------------

insert into disciplinary_warnings (employee_id, client_id, issued_date, level, category, description, action_required, employee_response, issued_by, witnessed_by, acknowledged_at, notes)
select e.id, c.id, w.issued_date, w.level::warning_level, w.category::warning_category, w.description,
       w.action_required, w.employee_response, w.issued_by, w.witnessed_by, w.acknowledged_at, w.notes
from (values
  ('e-006','metro-distribution', current_date - 25,'verbal','attendance','Two late arrivals within a single week.','Arrive on time; notify lead in advance of any delay.','Acknowledged; cited a transportation issue now resolved.','Estefany','Roxanna', now() - interval '25 day','First step — verbal coaching.'),
  ('e-004','abc-logistics',      current_date - 18,'written','attendance','Continued tardiness after a prior verbal warning.','Maintain on-time arrival for 30 days.','Signed; agreed to a revised commute plan.','Estefany','Hector Salinas', now() - interval '18 day','Escalated from verbal to written.'),
  ('e-014','isc',                current_date - 8, 'final','performance','Production targets missed across three consecutive weeks.','30-day performance improvement plan with weekly review.','Acknowledged; requested additional training.','Estefany','Roxanna', now() - interval '8 day','Final warning — PIP in effect.'),
  ('e-012','metro-distribution', current_date - 30,'written','conduct','Unprofessional exchange with a coworker on the floor.','Complete a conflict-resolution refresher.','Signed; apologized to the coworker.','Estefany','Roxanna', now() - interval '29 day','Written warning on file.'),
  ('e-009','isc',                current_date - 14,'verbal','safety','Observed not wearing required cut-resistant gloves on the pack line.','Wear required PPE at all times on the line.','Acknowledged; corrected immediately.','Estefany','Tanya Brooks', now() - interval '14 day','Verbal safety reminder.')
) as w(legacy_id, client_slug, issued_date, level, category, description, action_required, employee_response, issued_by, witnessed_by, acknowledged_at, notes)
join employees e on e.legacy_id = w.legacy_id
join clients c on c.slug = w.client_slug;

-- ---------- invoices ----------------------------------------------------

insert into invoices (number, client_id, period_start, period_end, issued_at, due_at, terms,
  subtotal, fee_pct, fee, tax, total, status, department, branch, bill_to_client_name,
  payroll_period_id, sent_at, paid_at, notes)
select v.number, c.id, v.pstart, v.pend, v.issued, v.due, 'Net 30',
  0, v.fee_pct, 0, 0, 0, v.status::invoice_status, v.dept, v.branch, v.billto,
  (select id from payroll_periods where status = v.pp::payroll_period_status limit 1),
  v.sent_at, v.paid_at, v.notes
from (values
  ('DT-2026-0461','pacific-vines',
     (date_trunc('week', current_date) - interval '2 week')::date,
     (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day' + interval '30 day')::date,
      8.00,'paid','Hospitality',null,null,'approved',
      now() - interval '11 day', now() - interval '2 day','Paid in full — thank you.'),
  ('DT-2026-0462','fafixon',
     (date_trunc('week', current_date) - interval '2 week')::date,
     (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day' + interval '30 day')::date,
      8.00,'paid','Warehouse','Stockton',null,'approved',
      now() - interval '11 day', now() - interval '4 day','Paid via ACH.'),
  ('DT-2026-0463','abc-logistics',
     (date_trunc('week', current_date) - interval '2 week')::date,
     (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day' + interval '30 day')::date,
      8.00,'sent','Warehouse','Tracy',null,'approved',
      now() - interval '11 day', null,'Sent — awaiting payment.'),
  ('DT-2026-0464','metro-distribution',
     (date_trunc('week', current_date) - interval '2 week')::date,
     (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day' + interval '30 day')::date,
      8.00,'sent','Warehouse','Sacramento',null,'approved',
      now() - interval '11 day', null,'Sent — awaiting payment.'),
  ('DT-2026-0465','fabfitfun',
     (date_trunc('week', current_date) - interval '2 week')::date,
     (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day' + interval '30 day')::date,
     12.00,'sent','Fulfillment — IC','Chino','FFF Brands LLC','approved',
      now() - interval '11 day', null,'Billed to parent entity FFF Brands LLC.'),
  ('DT-2026-0466','fabfitfun',
     (date_trunc('week', current_date) - interval '1 week')::date,
     (date_trunc('week', current_date) - interval '1 day')::date,
      current_date, (current_date + interval '30 day')::date,
     12.00,'draft','Fulfillment — WH','Chino','FFF Brands LLC','audited',
      null, null,'Draft — pending final review before send.'),
  ('DT-2026-0467','isc',
     (date_trunc('week', current_date) - interval '2 week')::date,
     (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
     (current_date - interval '40 day')::date, (current_date - interval '10 day')::date,
     10.00,'overdue','Warehouse','Fontana',null,'approved',
      now() - interval '40 day', null,'Past due — second reminder sent.'),
  ('DT-2026-0468','valley-foods',
     (date_trunc('week', current_date) - interval '1 week')::date,
     (date_trunc('week', current_date) - interval '1 day')::date,
      current_date, (current_date + interval '30 day')::date,
      8.00,'draft','Manufacturing','Modesto',null,'audited',
      null, null,'Draft — awaiting client timecard approval.'),
  ('DT-2026-0469','sonoma-senior',
     (date_trunc('week', current_date) - interval '2 week')::date,
     (date_trunc('week', current_date) - interval '1 week' - interval '1 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day')::date,
     (date_trunc('week', current_date) - interval '1 week' + interval '3 day' + interval '30 day')::date,
      9.00,'void','Healthcare','Santa Rosa',null,'approved',
      null, null,'Voided — duplicate generated in error; superseded.')
) as v(number, client_slug, pstart, pend, issued, due, fee_pct, status, dept, branch, billto, pp, sent_at, paid_at, notes)
join clients c on c.slug = v.client_slug;

-- ---------- invoice line items ------------------------------------------

insert into invoice_line_items (invoice_id, department, employee_name, role, hours, ot_hours, rate, amount, employee_cost, sort_order)
select i.id, li.department, li.employee_name, li.role, li.hours, li.ot_hours, li.rate, li.amount, li.employee_cost, li.sort_order
from (values
  ('DT-2026-0461','Hospitality — Kitchen',      'Maria Hernandez',       'Lead Line Cook',       76.0, 4.0, 28.50, 2337.00, 2150.00, 0),
  ('DT-2026-0461','Hospitality — Front of House','Aaliyah Brooks',       'Front Desk Lead',      80.0, 2.0, 23.50, 1950.50, 1800.00, 1),
  ('DT-2026-0461','Hospitality — Front of House','Marcus Webb',          'Banquet Server',       64.0, 0.0, 19.50, 1248.00, 1150.00, 2),
  ('DT-2026-0462','Warehouse',                  'Carlos Mendez',         'Forklift Driver',      80.0, 4.0, 24.50, 2107.00, 1960.00, 0),
  ('DT-2026-0462','Warehouse',                  'Latasha Williams',      'Inventory Control',    76.0, 0.0, 22.50, 1710.00, 1580.00, 1),
  ('DT-2026-0463','Warehouse',                  'Yolanda Foster',        'Inventory Lead',       80.0, 2.0, 28.00, 2324.00, 2150.00, 0),
  ('DT-2026-0463','Warehouse',                  'Jamal Thompson',        'Forklift Driver',      72.0, 0.0, 24.00, 1728.00, 1600.00, 1),
  ('DT-2026-0463','Warehouse',                  'Hector Salinas',        'Shift Lead',           80.0, 6.0, 27.00, 2403.00, 2220.00, 2),
  ('DT-2026-0464','Warehouse',                  'Devon Carter',          'Pick / Pack',          64.0, 0.0, 21.50, 1376.00, 1280.00, 0),
  ('DT-2026-0464','Warehouse',                  'Sergey Volkov',         'Pick / Pack',          72.0, 2.0, 21.00, 1575.00, 1460.00, 1),
  ('DT-2026-0465','Fulfillment — IC',           'Nadia Hassan',          'Pick / Pack',          80.0, 4.0, 22.00, 1892.00, 1760.00, 0),
  ('DT-2026-0465','Fulfillment — IC',           'Pooled associates (x3)','Pick / Pack',         180.0, 0.0, 22.00, 3960.00, 3680.00, 1),
  ('DT-2026-0466','Fulfillment — WH',           'Rashad Coleman',        'Pick / Pack',          72.0, 0.0, 22.00, 1584.00, 1470.00, 0),
  ('DT-2026-0467','Warehouse',                  'Tanya Brooks',          'Forklift Driver',      80.0, 4.0, 23.50, 2021.00, 1880.00, 0),
  ('DT-2026-0467','Warehouse',                  'Quincy Adams',          'Material Handler',     72.0, 0.0, 20.50, 1476.00, 1370.00, 1),
  ('DT-2026-0468','Manufacturing',              'Brianna Nguyen',        'Production Associate', 80.0, 2.0, 21.00, 1743.00, 1620.00, 0),
  ('DT-2026-0469','Healthcare',                 'Priya Anand',           'Caregiver',            40.0, 0.0, 23.00,  920.00,  860.00, 0)
) as li(number, department, employee_name, role, hours, ot_hours, rate, amount, employee_cost, sort_order)
join invoices i on i.number = li.number;

-- ---------- recompute invoice rollups from line items -------------------

update invoices i set
  subtotal = agg.sub,
  fee      = round(agg.sub * i.fee_pct / 100.0, 2),
  total    = round(agg.sub * i.fee_pct / 100.0, 2) + agg.sub + i.tax
from (
  select invoice_id, sum(amount) as sub
  from invoice_line_items
  group by invoice_id
) agg
where agg.invoice_id = i.id;

-- ---------- invoice runs (batch generation log) -------------------------

insert into invoice_runs (payroll_period_id, ran_at, ran_by, invoices_created, line_items_created, total_billed, notes)
select pp.id, now() - interval '11 day' + interval '9 hour', 'Roxanna',
  (select count(*) from invoices where payroll_period_id = pp.id),
  (select count(*) from invoice_line_items li join invoices i on i.id = li.invoice_id where i.payroll_period_id = pp.id),
  (select coalesce(sum(total), 0) from invoices where payroll_period_id = pp.id),
  'Batch generated from approved timecards for the closed period.'
from payroll_periods pp
where pp.status = 'approved';

insert into invoice_runs (payroll_period_id, ran_at, ran_by, invoices_created, line_items_created, total_billed, notes)
select pp.id, now() - interval '6 hour', 'Roxanna',
  (select count(*) from invoices where payroll_period_id = pp.id),
  (select count(*) from invoice_line_items li join invoices i on i.id = li.invoice_id where i.payroll_period_id = pp.id),
  (select coalesce(sum(total), 0) from invoices where payroll_period_id = pp.id),
  'Draft invoices generated for the audited period — pending review.'
from payroll_periods pp
where pp.status = 'audited';

commit;

-- =========================================================================
-- Demo seed complete. Suggested spot-checks:
--   select count(*) from employees;        -- 20
--   select count(*) from candidates;       -- 12  (every ATS stage)
--   select count(*) from positions;        -- 10
--   select count(*) from timecards;        -- 45
--   select count(*) from invoices;         --  9
--   select count(*) from calendar_events;  -- holidays + 18 birthdays + 14
-- =========================================================================
