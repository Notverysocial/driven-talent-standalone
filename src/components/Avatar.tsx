import { avTone, initials } from "@/lib/avatar";

export function Avatar({ name, size }: { name: string; size?: "lg" }) {
  const t = avTone(name);
  return (
    <div
      className={"dt-av" + (size === "lg" ? " lg" : "")}
      style={{ background: t.bg, color: t.fg }}
    >
      {initials(name)}
    </div>
  );
}
