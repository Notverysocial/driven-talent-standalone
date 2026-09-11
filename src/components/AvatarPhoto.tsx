"use client";

import { useState } from "react";

// The photo half of <Avatar>. Client-side only so a broken or deleted image
// falls back to the person's initials instead of a broken-image icon.
export function AvatarPhoto({ src, alt, fallback }: { src: string; alt: string; fallback: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <>{fallback}</>;
  // Public bucket URL — a plain img avoids next/image remote-domain config
  // (same choice as CandidatePhotos).
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
