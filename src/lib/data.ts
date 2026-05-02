// Driven Talent — multi-client staffing data model
//
// Models warehouse/logistics staffing where the same employee can be
// placed at multiple client sites in different shifts and positions.

export type ClientId = "fafixon" | "abc-logistics" | "metro-distribution";

export type Client = {
  id: ClientId;
  name: string;
  city: string;
  industry: string;
};

export const CLIENTS: Client[] = [
  { id: "fafixon", name: "Fafixon", city: "Stockton, CA", industry: "Cold Storage / 3PL" },
  { id: "abc-logistics", name: "ABC Logistics", city: "Tracy, CA", industry: "Freight & Distribution" },
  { id: "metro-distribution", name: "Metro Distribution", city: "Sacramento, CA", industry: "E-commerce Fulfillment" },
];

export const POSITIONS = [
  "Forklift Driver",
  "Inventory Control",
  "Receiving Clerk",
  "Shipping Clerk",
  "Pick / Pack",
  "Warehouse Associate",
  "Lead",
] as const;

export const DEPARTMENTS = [
  "Warehouse",
  "Inventory",
  "Receiving",
  "Shipping",
  "Logistics",
] as const;

export const SHIFTS = ["1st (6a–2p)", "2nd (2p–10p)", "3rd (10p–6a)"] as const;

export type Position = typeof POSITIONS[number];
export type Department = typeof DEPARTMENTS[number];
export type Shift = typeof SHIFTS[number];
export type ScoreBand = "green" | "yellow" | "red";
export type EmploymentStatus = "active" | "onboarding" | "inactive";

export type Assignment = {
  client: ClientId;
  position: Position;
  department: Department;
  shift: Shift;
  startDate: string; // YYYY-MM-DD
  rate: number; // bill rate $/hr
};

export type AttendanceEntry = {
  date: string; // YYYY-MM-DD
  client: ClientId;
  status: "present" | "missed" | "late" | "no-show" | "excused";
  notes?: string;
};

export type OnboardingTask = {
  id: string;
  label: string;
  done: boolean;
  doneOn?: string;
};

export type DocumentItem = {
  name: string;
  received: boolean;
  receivedOn?: string;
};

export type Employee = {
  id: string;
  name: string;
  phone: string;
  email: string;
  city: string;
  hireDate: string;
  status: EmploymentStatus;
  score: number; // 0-100
  band: ScoreBand;
  rank: number; // queue rank: 1 = front of line
  assignments: Assignment[];
  attendance: AttendanceEntry[];
  onboarding: {
    checklist: OnboardingTask[];
    documents: DocumentItem[];
  };
  notes?: string;
};

// ---------- helpers used in seed generation ----------

function band(score: number): ScoreBand {
  if (score >= 85) return "green";
  if (score >= 70) return "yellow";
  return "red";
}

function fullyOnboarded(): { checklist: OnboardingTask[]; documents: DocumentItem[] } {
  return {
    checklist: [
      { id: "i9", label: "I-9 Verified", done: true, doneOn: "2025-09-12" },
      { id: "w4", label: "W-4 on File", done: true, doneOn: "2025-09-12" },
      { id: "drug", label: "Drug Screen Cleared", done: true, doneOn: "2025-09-13" },
      { id: "bg", label: "Background Check", done: true, doneOn: "2025-09-15" },
      { id: "safety", label: "Safety Orientation", done: true, doneOn: "2025-09-16" },
      { id: "pp", label: "PPE Issued", done: true, doneOn: "2025-09-16" },
      { id: "client", label: "Client Site Tour", done: true, doneOn: "2025-09-17" },
    ],
    documents: [
      { name: "Driver's License", received: true, receivedOn: "2025-09-12" },
      { name: "Social Security Card", received: true, receivedOn: "2025-09-12" },
      { name: "Direct Deposit Form", received: true, receivedOn: "2025-09-13" },
      { name: "Emergency Contact", received: true, receivedOn: "2025-09-13" },
      { name: "Forklift Cert", received: true, receivedOn: "2025-09-14" },
    ],
  };
}

// ---------- seed roster ----------
// 18 employees — 4 hold positions at multiple clients (different shifts).

export const EMPLOYEES: Employee[] = [
  {
    id: "e-001",
    name: "Carlos Mendez",
    phone: "(209) 555-0142",
    email: "carlos.mendez@drivenpool.com",
    city: "Stockton, CA",
    hireDate: "2023-04-18",
    status: "active",
    score: 94,
    band: "green",
    rank: 2,
    assignments: [
      { client: "fafixon", position: "Forklift Driver", department: "Warehouse", shift: "1st (6a–2p)", startDate: "2024-01-08", rate: 24.5 },
      { client: "abc-logistics", position: "Forklift Driver", department: "Warehouse", shift: "2nd (2p–10p)", startDate: "2025-06-02", rate: 25.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "fafixon", status: "present" },
      { date: "2026-04-28", client: "fafixon", status: "present" },
      { date: "2026-04-29", client: "fafixon", status: "present" },
      { date: "2026-04-30", client: "abc-logistics", status: "present" },
      { date: "2026-05-01", client: "abc-logistics", status: "late", notes: "12 min — traffic on I-205" },
    ],
    onboarding: fullyOnboarded(),
    notes: "Anchors first shift at Fafixon. Picks up second shift at ABC twice a week.",
  },
  {
    id: "e-002",
    name: "Yolanda Foster",
    phone: "(916) 555-0188",
    email: "y.foster@drivenpool.com",
    city: "Sacramento, CA",
    hireDate: "2022-08-11",
    status: "active",
    score: 97,
    band: "green",
    rank: 1,
    assignments: [
      { client: "abc-logistics", position: "Lead", department: "Inventory", shift: "1st (6a–2p)", startDate: "2024-03-04", rate: 28.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "abc-logistics", status: "present" },
      { date: "2026-04-28", client: "abc-logistics", status: "present" },
      { date: "2026-04-29", client: "abc-logistics", status: "present" },
      { date: "2026-04-30", client: "abc-logistics", status: "present" },
      { date: "2026-05-01", client: "abc-logistics", status: "present" },
    ],
    onboarding: fullyOnboarded(),
    notes: "Top performer. Client account manager Anna at ABC requests her by name for cycle counts.",
  },
  {
    id: "e-003",
    name: "Latasha Williams",
    phone: "(209) 555-0167",
    email: "latasha.w@drivenpool.com",
    city: "Stockton, CA",
    hireDate: "2024-02-20",
    status: "active",
    score: 89,
    band: "green",
    rank: 4,
    assignments: [
      { client: "fafixon", position: "Inventory Control", department: "Inventory", shift: "1st (6a–2p)", startDate: "2024-02-26", rate: 22.5 },
    ],
    attendance: [
      { date: "2026-04-27", client: "fafixon", status: "present" },
      { date: "2026-04-28", client: "fafixon", status: "present" },
      { date: "2026-04-29", client: "fafixon", status: "missed", notes: "Childcare — called in 5a" },
      { date: "2026-04-30", client: "fafixon", status: "present" },
      { date: "2026-05-01", client: "fafixon", status: "present" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-004",
    name: "Roberto Garcia",
    phone: "(209) 555-0119",
    email: "rgarcia@drivenpool.com",
    city: "Modesto, CA",
    hireDate: "2023-11-06",
    status: "active",
    score: 86,
    band: "green",
    rank: 6,
    assignments: [
      { client: "fafixon", position: "Forklift Driver", department: "Warehouse", shift: "3rd (10p–6a)", startDate: "2024-01-15", rate: 26.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "fafixon", status: "present" },
      { date: "2026-04-28", client: "fafixon", status: "present" },
      { date: "2026-04-29", client: "fafixon", status: "present" },
      { date: "2026-04-30", client: "fafixon", status: "missed", notes: "Migraine — doctor's note submitted" },
      { date: "2026-05-01", client: "fafixon", status: "present" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-005",
    name: "Jamie Patel",
    phone: "(916) 555-0103",
    email: "jamie.patel@drivenpool.com",
    city: "Elk Grove, CA",
    hireDate: "2024-06-12",
    status: "active",
    score: 91,
    band: "green",
    rank: 3,
    assignments: [
      { client: "metro-distribution", position: "Receiving Clerk", department: "Receiving", shift: "1st (6a–2p)", startDate: "2024-06-17", rate: 23.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "metro-distribution", status: "present" },
      { date: "2026-04-28", client: "metro-distribution", status: "present" },
      { date: "2026-04-29", client: "metro-distribution", status: "present" },
      { date: "2026-04-30", client: "metro-distribution", status: "present" },
      { date: "2026-05-01", client: "metro-distribution", status: "present" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-006",
    name: "Devon Carter",
    phone: "(209) 555-0244",
    email: "devon.carter@drivenpool.com",
    city: "Stockton, CA",
    hireDate: "2024-10-03",
    status: "active",
    score: 88,
    band: "green",
    rank: 5,
    assignments: [
      { client: "fafixon", position: "Pick / Pack", department: "Warehouse", shift: "2nd (2p–10p)", startDate: "2024-10-08", rate: 21.0 },
      { client: "metro-distribution", position: "Pick / Pack", department: "Warehouse", shift: "3rd (10p–6a)", startDate: "2025-02-11", rate: 22.5 },
    ],
    attendance: [
      { date: "2026-04-27", client: "fafixon", status: "present" },
      { date: "2026-04-28", client: "fafixon", status: "present" },
      { date: "2026-04-29", client: "metro-distribution", status: "present" },
      { date: "2026-04-30", client: "metro-distribution", status: "present" },
      { date: "2026-05-01", client: "fafixon", status: "present" },
    ],
    onboarding: fullyOnboarded(),
    notes: "Hustler. Picks up Fafixon swing then rolls over to Metro graveyard 2x/week.",
  },
  {
    id: "e-007",
    name: "Stephanie Nguyen",
    phone: "(209) 555-0291",
    email: "s.nguyen@drivenpool.com",
    city: "Tracy, CA",
    hireDate: "2023-05-22",
    status: "active",
    score: 82,
    band: "yellow",
    rank: 9,
    assignments: [
      { client: "abc-logistics", position: "Inventory Control", department: "Inventory", shift: "1st (6a–2p)", startDate: "2023-05-30", rate: 22.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "abc-logistics", status: "present" },
      { date: "2026-04-28", client: "abc-logistics", status: "missed", notes: "Personal" },
      { date: "2026-04-29", client: "abc-logistics", status: "missed", notes: "No call no show — 2nd this month" },
      { date: "2026-04-30", client: "abc-logistics", status: "present" },
      { date: "2026-05-01", client: "abc-logistics", status: "late", notes: "22 min" },
    ],
    onboarding: fullyOnboarded(),
    notes: "Score slipping — coaching conversation scheduled with Roxanna.",
  },
  {
    id: "e-008",
    name: "Marcus Thompson",
    phone: "(916) 555-0177",
    email: "m.thompson@drivenpool.com",
    city: "Sacramento, CA",
    hireDate: "2024-01-14",
    status: "active",
    score: 58,
    band: "red",
    rank: 17,
    assignments: [
      { client: "metro-distribution", position: "Forklift Driver", department: "Warehouse", shift: "1st (6a–2p)", startDate: "2024-01-22", rate: 24.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "metro-distribution", status: "no-show", notes: "No call. Client GM flagged." },
      { date: "2026-04-28", client: "metro-distribution", status: "present" },
      { date: "2026-04-29", client: "metro-distribution", status: "missed", notes: "Called in 30 min before shift" },
      { date: "2026-04-30", client: "metro-distribution", status: "no-show" },
      { date: "2026-05-01", client: "metro-distribution", status: "present" },
    ],
    onboarding: fullyOnboarded(),
    notes: "On final notice. Three no-shows in 30 days. Move to back of queue.",
  },
  {
    id: "e-009",
    name: "Aisha Robinson",
    phone: "(209) 555-0118",
    email: "aisha.r@drivenpool.com",
    city: "Stockton, CA",
    hireDate: "2024-03-11",
    status: "active",
    score: 90,
    band: "green",
    rank: 7,
    assignments: [
      { client: "fafixon", position: "Receiving Clerk", department: "Receiving", shift: "1st (6a–2p)", startDate: "2024-03-18", rate: 22.5 },
    ],
    attendance: [
      { date: "2026-04-27", client: "fafixon", status: "present" },
      { date: "2026-04-28", client: "fafixon", status: "present" },
      { date: "2026-04-29", client: "fafixon", status: "present" },
      { date: "2026-04-30", client: "fafixon", status: "present" },
      { date: "2026-05-01", client: "fafixon", status: "present" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-010",
    name: "Elijah Brooks",
    phone: "(209) 555-0263",
    email: "ebrooks@drivenpool.com",
    city: "Tracy, CA",
    hireDate: "2024-07-29",
    status: "active",
    score: 76,
    band: "yellow",
    rank: 12,
    assignments: [
      { client: "abc-logistics", position: "Warehouse Associate", department: "Warehouse", shift: "2nd (2p–10p)", startDate: "2024-08-05", rate: 20.5 },
    ],
    attendance: [
      { date: "2026-04-27", client: "abc-logistics", status: "present" },
      { date: "2026-04-28", client: "abc-logistics", status: "missed", notes: "Sick" },
      { date: "2026-04-29", client: "abc-logistics", status: "present" },
      { date: "2026-04-30", client: "abc-logistics", status: "missed", notes: "Sick (extended)" },
      { date: "2026-05-01", client: "abc-logistics", status: "present" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-011",
    name: "Crystal Diaz",
    phone: "(916) 555-0205",
    email: "crystal.d@drivenpool.com",
    city: "Sacramento, CA",
    hireDate: "2023-09-04",
    status: "active",
    score: 87,
    band: "green",
    rank: 8,
    assignments: [
      { client: "metro-distribution", position: "Inventory Control", department: "Inventory", shift: "2nd (2p–10p)", startDate: "2023-09-11", rate: 23.5 },
    ],
    attendance: [
      { date: "2026-04-27", client: "metro-distribution", status: "present" },
      { date: "2026-04-28", client: "metro-distribution", status: "present" },
      { date: "2026-04-29", client: "metro-distribution", status: "present" },
      { date: "2026-04-30", client: "metro-distribution", status: "present" },
      { date: "2026-05-01", client: "metro-distribution", status: "missed", notes: "Family emergency" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-012",
    name: "Brandon Lee",
    phone: "(209) 555-0186",
    email: "blee@drivenpool.com",
    city: "Lodi, CA",
    hireDate: "2024-04-15",
    status: "active",
    score: 84,
    band: "yellow",
    rank: 10,
    assignments: [
      { client: "fafixon", position: "Shipping Clerk", department: "Shipping", shift: "1st (6a–2p)", startDate: "2024-04-22", rate: 22.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "fafixon", status: "present" },
      { date: "2026-04-28", client: "fafixon", status: "present" },
      { date: "2026-04-29", client: "fafixon", status: "late", notes: "8 min" },
      { date: "2026-04-30", client: "fafixon", status: "present" },
      { date: "2026-05-01", client: "fafixon", status: "missed" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-013",
    name: "Hector Ramirez",
    phone: "(209) 555-0233",
    email: "hramirez@drivenpool.com",
    city: "Manteca, CA",
    hireDate: "2026-04-18",
    status: "onboarding",
    score: 0,
    band: "yellow",
    rank: 99,
    assignments: [
      { client: "fafixon", position: "Forklift Driver", department: "Warehouse", shift: "2nd (2p–10p)", startDate: "2026-05-05", rate: 24.0 },
    ],
    attendance: [],
    onboarding: {
      checklist: [
        { id: "i9", label: "I-9 Verified", done: true, doneOn: "2026-04-19" },
        { id: "w4", label: "W-4 on File", done: true, doneOn: "2026-04-19" },
        { id: "drug", label: "Drug Screen Cleared", done: true, doneOn: "2026-04-22" },
        { id: "bg", label: "Background Check", done: true, doneOn: "2026-04-25" },
        { id: "safety", label: "Safety Orientation", done: false },
        { id: "pp", label: "PPE Issued", done: false },
        { id: "client", label: "Client Site Tour", done: false },
      ],
      documents: [
        { name: "Driver's License", received: true, receivedOn: "2026-04-19" },
        { name: "Social Security Card", received: true, receivedOn: "2026-04-19" },
        { name: "Direct Deposit Form", received: true, receivedOn: "2026-04-22" },
        { name: "Emergency Contact", received: false },
        { name: "Forklift Cert", received: true, receivedOn: "2026-04-25" },
      ],
    },
    notes: "Starts at Fafixon May 5. Schedule site tour for Friday.",
  },
  {
    id: "e-014",
    name: "Tasha Brown",
    phone: "(916) 555-0140",
    email: "tasha.b@drivenpool.com",
    city: "Sacramento, CA",
    hireDate: "2023-12-04",
    status: "active",
    score: 79,
    band: "yellow",
    rank: 11,
    assignments: [
      { client: "metro-distribution", position: "Shipping Clerk", department: "Shipping", shift: "2nd (2p–10p)", startDate: "2023-12-11", rate: 22.5 },
    ],
    attendance: [
      { date: "2026-04-27", client: "metro-distribution", status: "present" },
      { date: "2026-04-28", client: "metro-distribution", status: "missed" },
      { date: "2026-04-29", client: "metro-distribution", status: "present" },
      { date: "2026-04-30", client: "metro-distribution", status: "present" },
      { date: "2026-05-01", client: "metro-distribution", status: "missed" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-015",
    name: "Anthony Vega",
    phone: "(209) 555-0277",
    email: "avega@drivenpool.com",
    city: "Manteca, CA",
    hireDate: "2022-11-22",
    status: "active",
    score: 92,
    band: "green",
    rank: 3,
    assignments: [
      { client: "abc-logistics", position: "Forklift Driver", department: "Warehouse", shift: "1st (6a–2p)", startDate: "2023-01-09", rate: 25.0 },
      { client: "fafixon", position: "Forklift Driver", department: "Warehouse", shift: "3rd (10p–6a)", startDate: "2024-08-12", rate: 26.5 },
    ],
    attendance: [
      { date: "2026-04-27", client: "abc-logistics", status: "present" },
      { date: "2026-04-28", client: "fafixon", status: "present" },
      { date: "2026-04-29", client: "abc-logistics", status: "present" },
      { date: "2026-04-30", client: "fafixon", status: "present" },
      { date: "2026-05-01", client: "abc-logistics", status: "present" },
    ],
    onboarding: fullyOnboarded(),
    notes: "Splits two clients across day and graveyard. Reliable.",
  },
  {
    id: "e-016",
    name: "Keisha Howard",
    phone: "(209) 555-0299",
    email: "khoward@drivenpool.com",
    city: "Stockton, CA",
    hireDate: "2024-05-30",
    status: "active",
    score: 51,
    band: "red",
    rank: 18,
    assignments: [
      { client: "fafixon", position: "Inventory Control", department: "Inventory", shift: "2nd (2p–10p)", startDate: "2024-06-04", rate: 22.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "fafixon", status: "no-show" },
      { date: "2026-04-28", client: "fafixon", status: "missed" },
      { date: "2026-04-29", client: "fafixon", status: "no-show" },
      { date: "2026-04-30", client: "fafixon", status: "missed" },
      { date: "2026-05-01", client: "fafixon", status: "missed" },
    ],
    onboarding: fullyOnboarded(),
    notes: "End of the line. Five missed shifts in five days. Pull from queue, do not redeploy.",
  },
  {
    id: "e-017",
    name: "Diego Salazar",
    phone: "(916) 555-0214",
    email: "dsalazar@drivenpool.com",
    city: "Roseville, CA",
    hireDate: "2024-02-08",
    status: "active",
    score: 93,
    band: "green",
    rank: 2,
    assignments: [
      { client: "metro-distribution", position: "Receiving Clerk", department: "Receiving", shift: "3rd (10p–6a)", startDate: "2024-02-15", rate: 24.0 },
    ],
    attendance: [
      { date: "2026-04-27", client: "metro-distribution", status: "present" },
      { date: "2026-04-28", client: "metro-distribution", status: "present" },
      { date: "2026-04-29", client: "metro-distribution", status: "present" },
      { date: "2026-04-30", client: "metro-distribution", status: "present" },
      { date: "2026-05-01", client: "metro-distribution", status: "present" },
    ],
    onboarding: fullyOnboarded(),
  },
  {
    id: "e-018",
    name: "Ashley Cooper",
    phone: "(209) 555-0300",
    email: "ashley.c@drivenpool.com",
    city: "Stockton, CA",
    hireDate: "2026-04-26",
    status: "onboarding",
    score: 0,
    band: "yellow",
    rank: 99,
    assignments: [
      { client: "fafixon", position: "Warehouse Associate", department: "Warehouse", shift: "1st (6a–2p)", startDate: "2026-05-08", rate: 19.5 },
    ],
    attendance: [],
    onboarding: {
      checklist: [
        { id: "i9", label: "I-9 Verified", done: true, doneOn: "2026-04-26" },
        { id: "w4", label: "W-4 on File", done: true, doneOn: "2026-04-26" },
        { id: "drug", label: "Drug Screen Cleared", done: false },
        { id: "bg", label: "Background Check", done: false },
        { id: "safety", label: "Safety Orientation", done: false },
        { id: "pp", label: "PPE Issued", done: false },
        { id: "client", label: "Client Site Tour", done: false },
      ],
      documents: [
        { name: "Driver's License", received: true, receivedOn: "2026-04-26" },
        { name: "Social Security Card", received: false },
        { name: "Direct Deposit Form", received: false },
        { name: "Emergency Contact", received: true, receivedOn: "2026-04-26" },
        { name: "Forklift Cert", received: false },
      ],
    },
    notes: "Just hired. No forklift cert yet — placing in associate role first.",
  },
];

// ---------- 30-day attendance backfill ----------
// The hand-crafted `attendance` arrays above hold the most recent 5 days
// (Apr 27 – May 1, 2026). For accurate 30-day rollups we extend each active
// employee's history backward 25 more days using a deterministic FNV-1a
// hash of (id, dayIndex). This stays stable across builds with no RNG.

const REFERENCE_DATE = new Date("2026-05-02T00:00:00Z");

function fnv1a(str: string, salt: number): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= salt;
  h = Math.imul(h, 16777619);
  return Math.abs(h);
}

function isoDay(offsetFromReference: number): string {
  const d = new Date(REFERENCE_DATE);
  d.setUTCDate(d.getUTCDate() - offsetFromReference);
  return d.toISOString().slice(0, 10);
}

function generateStatus(
  emp: Employee,
  dayIndex: number,
): AttendanceEntry["status"] {
  const r = fnv1a(emp.id, dayIndex) % 100;
  // Higher score = smaller miss budget. Score 100 → 0; score 60 → ~7.
  const missBudget = Math.max(0, Math.round((100 - emp.score) / 6));
  const slot = (dayIndex + fnv1a(emp.id, 99)) % 30;
  if (slot < missBudget) {
    const flavor = fnv1a(emp.id, dayIndex + 7) % 10;
    if (flavor < 2) return "excused";
    if (flavor < 5) return "late";
    return "missed";
  }
  if (r < 4) return "late";
  return "present";
}

function pickClientForGenerated(emp: Employee, dayIndex: number): ClientId {
  if (emp.assignments.length === 1) return emp.assignments[0].client;
  const idx = fnv1a(emp.id, dayIndex + 31) % emp.assignments.length;
  return emp.assignments[idx].client;
}

function extendAttendance(emp: Employee): AttendanceEntry[] {
  // Onboarding employees have no floor history.
  if (emp.status === "onboarding") return emp.attendance;

  const handByDate = new Map(emp.attendance.map((a) => [a.date, a]));
  const out: AttendanceEntry[] = [];
  // i=1 is yesterday (Apr 30); i=30 is 30 days back.
  for (let i = 1; i <= 30; i++) {
    const date = isoDay(i);
    const hand = handByDate.get(date);
    if (hand) {
      out.push(hand);
    } else {
      out.push({
        date,
        client: pickClientForGenerated(emp, i),
        status: generateStatus(emp, i),
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Mutate in place so all consumers see the full 30-day window without
// changing import paths or breaking the hand-crafted recent days.
for (const emp of EMPLOYEES) {
  emp.attendance = extendAttendance(emp);
}

// ---------- 15-step onboarding template (from operator playbook) ----------

export type OnboardingCategory =
  | "Documentation"
  | "Compliance"
  | "Training"
  | "Equipment"
  | "Review";

export type StandardChecklistItem = {
  id: string;
  label: string;
  detail: string;
  category: OnboardingCategory;
};

export const STANDARD_CHECKLIST: StandardChecklistItem[] = [
  { id: "i9", label: "Form I-9 — Employment Eligibility", detail: "Verify identity & work authorization within 3 days of hire", category: "Compliance" },
  { id: "w4", label: "Form W-4 — Tax Withholding", detail: "Federal & California state tax election", category: "Documentation" },
  { id: "directdeposit", label: "Direct Deposit Authorization", detail: "Bank routing & account on file", category: "Documentation" },
  { id: "background", label: "Background Check Cleared", detail: "7-year criminal + employment verification", category: "Compliance" },
  { id: "drug", label: "Drug Screen — 5-Panel", detail: "Required for warehouse + driving positions", category: "Compliance" },
  { id: "handbook", label: "Employee Handbook Acknowledged", detail: "Signed receipt of policies & code of conduct", category: "Documentation" },
  { id: "safety", label: "OSHA-10 Safety Training", detail: "10-hour general industry certification", category: "Training" },
  { id: "forklift", label: "Forklift Certification (if applicable)", detail: "Powered industrial truck operator license", category: "Training" },
  { id: "siteorientation", label: "Client Site Orientation", detail: "Walkthrough at assigned client facility", category: "Training" },
  { id: "ppe", label: "PPE Issued", detail: "Hi-vis vest, steel-toe boots, hard hat, gloves", category: "Equipment" },
  { id: "badge", label: "Site Badge & Access Credentials", detail: "Photo ID, badge, parking permit", category: "Equipment" },
  { id: "uniform", label: "Uniform Sizing & Issuance", detail: "2 sets minimum, branded with Driven Talent", category: "Equipment" },
  { id: "day1", label: "Day-1 Check-In Call", detail: "Driven Talent rep confirms first-day arrival", category: "Review" },
  { id: "day7", label: "7-Day Review", detail: "Coordinator + supervisor sync on early performance", category: "Review" },
  { id: "day30", label: "30-Day Review", detail: "Formal performance check + scoring entry", category: "Review" },
];

export const STANDARD_CHECKLIST_BY_CATEGORY: Record<
  OnboardingCategory,
  StandardChecklistItem[]
> = {
  Documentation: STANDARD_CHECKLIST.filter((i) => i.category === "Documentation"),
  Compliance: STANDARD_CHECKLIST.filter((i) => i.category === "Compliance"),
  Training: STANDARD_CHECKLIST.filter((i) => i.category === "Training"),
  Equipment: STANDARD_CHECKLIST.filter((i) => i.category === "Equipment"),
  Review: STANDARD_CHECKLIST.filter((i) => i.category === "Review"),
};

// Maps each onboarding employee to which 15-step items are already cleared.
// The existing 7-step `onboarding.checklist` field stays as the "legacy" view.
export const STANDARD_PROGRESS: Record<string, string[]> = {
  "e-013": ["i9", "w4", "directdeposit", "background", "drug", "handbook", "forklift"],
  "e-018": ["i9", "w4", "directdeposit"],
};

// ---------- attendance helpers (weighted scoring) ----------

export type AttendanceCounts = {
  present: number;
  late: number;
  missed: number;
  noShow: number;
  excused: number;
  total: number;
};

export function countAttendance(records: AttendanceEntry[]): AttendanceCounts {
  let present = 0,
    late = 0,
    missed = 0,
    noShow = 0,
    excused = 0;
  for (const r of records) {
    if (r.status === "present") present++;
    else if (r.status === "late") late++;
    else if (r.status === "missed") missed++;
    else if (r.status === "no-show") noShow++;
    else if (r.status === "excused") excused++;
  }
  return {
    present,
    late,
    missed,
    noShow,
    excused,
    total: present + late + missed + noShow + excused,
  };
}

// Weighted attendance % per Branch 3 formula:
//   (present + 0.5 × late) / scoreable * 100
// Excused days are excluded from the denominator (protected leave doesn't count).
export function weightedAttendancePct(records: AttendanceEntry[]): number {
  const c = countAttendance(records);
  const scoreable = c.present + c.late + c.missed + c.noShow;
  if (scoreable === 0) return 0;
  return Math.round(((c.present + c.late * 0.5) / scoreable) * 1000) / 10;
}

export function lastNDays(
  records: AttendanceEntry[],
  n: number,
): AttendanceEntry[] {
  return [...records]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, n);
}

// ---------- performance tier (combines score + recent attendance) ----------

export type PerformanceTier = "green" | "yellow" | "red";

export const TIER_LABEL: Record<PerformanceTier, string> = {
  green: "On Track",
  yellow: "Watch",
  red: "At Risk",
};

export function performanceTier(
  score: number,
  missedDays: number,
): PerformanceTier {
  if (score === 0) return "yellow"; // onboarding
  if (score >= 85 && missedDays <= 1) return "green";
  if (score < 65 || missedDays >= 4) return "red";
  return "yellow";
}

export function statusLabel(s: AttendanceEntry["status"]): string {
  if (s === "present") return "Present";
  if (s === "late") return "Late";
  if (s === "missed") return "Missed";
  if (s === "no-show") return "No-Show";
  return "Excused";
}

// ---------- selectors ----------

export function getClient(id: ClientId): Client {
  return CLIENTS.find((c) => c.id === id)!;
}

export function getEmployee(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id);
}

export function clientNameOf(id: ClientId) {
  return getClient(id).name;
}

export type EmployeeRow = Employee & {
  assignment: Assignment;
  missedDays: number;
  noShows: number;
};

// Each (employee, assignment) pair becomes a row in the multi-client roster.
export function flattenRoster(): EmployeeRow[] {
  const rows: EmployeeRow[] = [];
  for (const emp of EMPLOYEES) {
    for (const a of emp.assignments) {
      const missedDays = emp.attendance.filter(
        (x) => x.client === a.client && (x.status === "missed" || x.status === "no-show")
      ).length;
      const noShows = emp.attendance.filter(
        (x) => x.client === a.client && x.status === "no-show"
      ).length;
      rows.push({ ...emp, assignment: a, missedDays, noShows });
    }
  }
  return rows;
}

export function bandColor(b: ScoreBand): { fg: string; bg: string; tone: "green" | "amber" | "red" } {
  if (b === "green") return { fg: "var(--dt-success)", bg: "var(--dt-success-bg)", tone: "green" };
  if (b === "yellow") return { fg: "var(--dt-warning)", bg: "var(--dt-warning-bg)", tone: "amber" };
  return { fg: "var(--dt-danger)", bg: "var(--dt-danger-bg)", tone: "red" };
}
