export type Client = "Fafixon" | "Client B" | "Client C";

export type Position =
  | "Forklift Driver"
  | "Inventory Control"
  | "Receiving Clerk"
  | "Mentoring Clerk";

export type Department = "Warehouse" | "Operations" | "Logistics" | "Training";

export type Shift = "Day" | "Night" | "Swing";

export type EmployeeStatus =
  | "active"
  | "on-assignment"
  | "pending"
  | "available";

export type Employee = {
  id: string;
  name: string;
  position: Position;
  department: Department;
  client: Client;
  shift: Shift;
  score: number;
  status: EmployeeStatus;
  hireDate: string;
  tenure: string;
  rate: string;
  email: string;
  phone: string;
};

export const POSITION_TO_DEPARTMENT: Record<Position, Department> = {
  "Forklift Driver": "Warehouse",
  "Inventory Control": "Operations",
  "Receiving Clerk": "Logistics",
  "Mentoring Clerk": "Training",
};

export const CLIENTS: Client[] = ["Fafixon", "Client B", "Client C"];
export const POSITIONS: Position[] = [
  "Forklift Driver",
  "Inventory Control",
  "Receiving Clerk",
  "Mentoring Clerk",
];
export const DEPARTMENTS: Department[] = [
  "Warehouse",
  "Operations",
  "Logistics",
  "Training",
];
export const SHIFTS: Shift[] = ["Day", "Night", "Swing"];

export const EMPLOYEES: Employee[] = [
  {
    id: "EM-1001",
    name: "Marcus Allen",
    position: "Forklift Driver",
    department: "Warehouse",
    client: "Fafixon",
    shift: "Day",
    score: 94,
    status: "active",
    hireDate: "2024-03-12",
    tenure: "2y 1mo",
    rate: "$24.50/hr",
    email: "marcus.allen@driventalent.co",
    phone: "(415) 555-0118",
  },
  {
    id: "EM-1002",
    name: "Daniela Ortiz",
    position: "Inventory Control",
    department: "Operations",
    client: "Fafixon",
    shift: "Day",
    score: 88,
    status: "active",
    hireDate: "2024-08-04",
    tenure: "1y 8mo",
    rate: "$26.00/hr",
    email: "daniela.ortiz@driventalent.co",
    phone: "(415) 555-0142",
  },
  {
    id: "EM-1003",
    name: "Jamal Whitfield",
    position: "Receiving Clerk",
    department: "Logistics",
    client: "Fafixon",
    shift: "Swing",
    score: 79,
    status: "active",
    hireDate: "2025-01-21",
    tenure: "1y 3mo",
    rate: "$22.75/hr",
    email: "jamal.whitfield@driventalent.co",
    phone: "(415) 555-0163",
  },
  {
    id: "EM-1004",
    name: "Yvonne Carter",
    position: "Mentoring Clerk",
    department: "Training",
    client: "Fafixon",
    shift: "Day",
    score: 91,
    status: "active",
    hireDate: "2023-09-18",
    tenure: "2y 7mo",
    rate: "$27.50/hr",
    email: "yvonne.carter@driventalent.co",
    phone: "(415) 555-0179",
  },
  {
    id: "EM-1005",
    name: "Tyrell Booker",
    position: "Forklift Driver",
    department: "Warehouse",
    client: "Fafixon",
    shift: "Night",
    score: 62,
    status: "on-assignment",
    hireDate: "2025-09-02",
    tenure: "8 mo",
    rate: "$23.00/hr",
    email: "tyrell.booker@driventalent.co",
    phone: "(415) 555-0188",
  },

  {
    id: "EM-1006",
    name: "Priya Anand",
    position: "Inventory Control",
    department: "Operations",
    client: "Client B",
    shift: "Day",
    score: 96,
    status: "active",
    hireDate: "2022-11-07",
    tenure: "3y 5mo",
    rate: "$28.50/hr",
    email: "priya.anand@driventalent.co",
    phone: "(916) 555-0203",
  },
  {
    id: "EM-1007",
    name: "Hector Salazar",
    position: "Forklift Driver",
    department: "Warehouse",
    client: "Client B",
    shift: "Swing",
    score: 81,
    status: "active",
    hireDate: "2024-05-30",
    tenure: "1y 11mo",
    rate: "$24.25/hr",
    email: "hector.salazar@driventalent.co",
    phone: "(916) 555-0211",
  },
  {
    id: "EM-1008",
    name: "Brittany Cole",
    position: "Receiving Clerk",
    department: "Logistics",
    client: "Client B",
    shift: "Day",
    score: 73,
    status: "active",
    hireDate: "2025-03-14",
    tenure: "1y 1mo",
    rate: "$22.00/hr",
    email: "brittany.cole@driventalent.co",
    phone: "(916) 555-0228",
  },
  {
    id: "EM-1009",
    name: "Linh Tran",
    position: "Mentoring Clerk",
    department: "Training",
    client: "Client B",
    shift: "Day",
    score: 86,
    status: "active",
    hireDate: "2024-02-19",
    tenure: "2y 2mo",
    rate: "$26.75/hr",
    email: "linh.tran@driventalent.co",
    phone: "(916) 555-0237",
  },
  {
    id: "EM-1010",
    name: "Kelvin Burroughs",
    position: "Forklift Driver",
    department: "Warehouse",
    client: "Client B",
    shift: "Night",
    score: 55,
    status: "pending",
    hireDate: "2026-02-08",
    tenure: "2 mo",
    rate: "$22.50/hr",
    email: "kelvin.burroughs@driventalent.co",
    phone: "(916) 555-0245",
  },

  {
    id: "EM-1011",
    name: "Renee Fontaine",
    position: "Receiving Clerk",
    department: "Logistics",
    client: "Client C",
    shift: "Day",
    score: 89,
    status: "active",
    hireDate: "2023-06-12",
    tenure: "2y 10mo",
    rate: "$25.00/hr",
    email: "renee.fontaine@driventalent.co",
    phone: "(707) 555-0319",
  },
  {
    id: "EM-1012",
    name: "Andre Solomon",
    position: "Inventory Control",
    department: "Operations",
    client: "Client C",
    shift: "Night",
    score: 70,
    status: "active",
    hireDate: "2024-10-29",
    tenure: "1y 6mo",
    rate: "$25.50/hr",
    email: "andre.solomon@driventalent.co",
    phone: "(707) 555-0322",
  },
  {
    id: "EM-1013",
    name: "Michelle Park",
    position: "Mentoring Clerk",
    department: "Training",
    client: "Client C",
    shift: "Day",
    score: 92,
    status: "active",
    hireDate: "2023-04-03",
    tenure: "3y 1mo",
    rate: "$28.00/hr",
    email: "michelle.park@driventalent.co",
    phone: "(707) 555-0336",
  },
  {
    id: "EM-1014",
    name: "Jorge Beltran",
    position: "Forklift Driver",
    department: "Warehouse",
    client: "Client C",
    shift: "Swing",
    score: 76,
    status: "active",
    hireDate: "2025-06-10",
    tenure: "10 mo",
    rate: "$23.75/hr",
    email: "jorge.beltran@driventalent.co",
    phone: "(707) 555-0341",
  },
  {
    id: "EM-1015",
    name: "Tasha Greene",
    position: "Receiving Clerk",
    department: "Logistics",
    client: "Client C",
    shift: "Night",
    score: 48,
    status: "available",
    hireDate: "2026-01-19",
    tenure: "3 mo",
    rate: "$21.50/hr",
    email: "tasha.greene@driventalent.co",
    phone: "(707) 555-0359",
  },
];

export function getEmployee(id: string): Employee | undefined {
  return EMPLOYEES.find((e) => e.id === id);
}
