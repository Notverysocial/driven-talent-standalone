// Shared color palette for charts — pulled from the Driven Talent design tokens
// in globals.css so chart visuals stay in sync with the rest of the app.

export const CHART_COLORS = {
  black: "#1A1A1A",
  blackSoft: "#2A2A2A",
  gold: "#F5A623",
  goldDeep: "#C8881C",
  goldBright: "#FFD700",
  goldSoft: "#F4D896",
  goldPale: "#FAEBC8",
  success: "#4F7A3A",
  successSoft: "#BFD3A6",
  warning: "#C28B1E",
  warningSoft: "#E6C887",
  danger: "#B23A3A",
  dangerSoft: "#D9A6A6",
  warm100: "#F2F0EA",
  warm150: "#E8E5DC",
  warm200: "#D9D2C2",
  warm300: "#B8AE9A",
  warm500: "#6E6657",
} as const;

export const CHART_FONT =
  "'Jost', 'Futura', 'Avenir Next', -apple-system, system-ui, sans-serif";

// Tiny shared axis tick style so every chart matches the dt-table header look.
export const AXIS_TICK = {
  fill: CHART_COLORS.warm500,
  fontSize: 10,
  fontFamily: CHART_FONT,
  letterSpacing: "0.04em",
} as const;

export const AXIS_LINE_STYLE = { stroke: CHART_COLORS.warm150 };
export const GRID_STYLE = { stroke: CHART_COLORS.warm100 };
