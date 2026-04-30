const AV_TONES = [
  { bg: "#F4D896", fg: "#5A4416" },
  { bg: "#E8D5C4", fg: "#5C3F28" },
  { bg: "#D9D2C2", fg: "#3D3830" },
  { bg: "#F5E5C7", fg: "#7A5616" },
  { bg: "#EFD9B8", fg: "#5C3F1E" },
  { bg: "#1a1a1a", fg: "#FFD700" },
  { bg: "#FAEBC8", fg: "#8B6111" },
  { bg: "#E5DFD3", fg: "#3D3830" },
];

export function avTone(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AV_TONES[h % AV_TONES.length];
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
}
