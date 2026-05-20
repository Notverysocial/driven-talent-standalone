export type IconName =
  | "home"
  | "users"
  | "star"
  | "clock"
  | "file"
  | "check"
  | "chart"
  | "building"
  | "calendar"
  | "clipboard"
  | "message";

export function NavIcon({ name }: { name: IconName }) {
  const props = {
    width: 16,
    height: 16,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M3 10.5L12 3l9 7.5" />
          <path d="M5 9.5V20h14V9.5" />
        </svg>
      );
    case "users":
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <circle cx="17" cy="9" r="2.6" />
          <path d="M15 14.5c2.5 0 6 1.6 6 5.5" />
        </svg>
      );
    case "star":
      return (
        <svg {...props}>
          <path d="M12 3l2.7 5.7 6.3.9-4.6 4.4 1.1 6.3L12 17.4 6.5 20.3l1.1-6.3L3 9.6l6.3-.9z" />
        </svg>
      );
    case "clock":
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "file":
      return (
        <svg {...props}>
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
          <path d="M14 3v5h5" />
        </svg>
      );
    case "check":
      return (
        <svg {...props}>
          <path d="M21 7l-2 2" />
          <circle cx="12" cy="12" r="9" />
          <path d="M8 12l3 3 5-6" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <path d="M4 20V10" />
          <path d="M10 20V4" />
          <path d="M16 20v-7" />
          <path d="M22 20H2" />
        </svg>
      );
    case "building":
      return (
        <svg {...props}>
          <rect x="4" y="3" width="16" height="18" rx="1" />
          <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...props}>
          <rect x="3" y="5" width="18" height="16" rx="1.5" />
          <path d="M3 9h18M8 3v4M16 3v4" />
          <circle cx="8" cy="14" r="0.6" fill="currentColor" />
          <circle cx="12" cy="14" r="0.6" fill="currentColor" />
          <circle cx="16" cy="14" r="0.6" fill="currentColor" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...props}>
          <rect x="5" y="4" width="14" height="17" rx="1.5" />
          <rect x="9" y="2.5" width="6" height="3.5" rx="1" />
          <path d="M9 11h6M9 14h6M9 17h4" />
        </svg>
      );
    case "message":
      return (
        <svg {...props}>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
  }
}
