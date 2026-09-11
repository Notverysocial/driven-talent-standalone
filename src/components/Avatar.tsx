import { avTone, avatarPhotoSrc, initials } from "@/lib/avatar";
import { AvatarPhoto } from "./AvatarPhoto";

/**
 * A person's avatar: their photo when one is on file, otherwise initials.
 *
 * Prospect photos (candidates.photo_url) used to render on the recruiter
 * cards; that surface was retired in PR #42 (08a568f) and the photos stopped
 * showing anywhere but the Photos tab. The fallback now lives HERE, so every
 * surface that passes a photo gets it and everything else keeps initials.
 */
export function Avatar({
  name,
  size,
  photoUrl,
}: {
  name: string;
  size?: "lg";
  photoUrl?: string | null;
}) {
  const t = avTone(name);
  const src = avatarPhotoSrc(photoUrl);
  return (
    <div
      className={"dt-av" + (size === "lg" ? " lg" : "") + (src ? " has-photo" : "")}
      style={{ background: t.bg, color: t.fg }}
    >
      {src ? <AvatarPhoto src={src} alt={name} fallback={initials(name)} /> : initials(name)}
    </div>
  );
}
