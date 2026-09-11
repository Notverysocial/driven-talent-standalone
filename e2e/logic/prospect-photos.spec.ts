import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { avatarPhotoSrc } from "../../src/lib/avatar";

// Prospect photos. They stopped showing when the recruiter cards — the only
// surface that rendered candidates.photo_url — were retired in PR #42
// (08a568f). The photo/initials fallback now lives in the shared <Avatar>;
// these pin that the prospect surfaces actually pass a photo to it.

test("an https photo URL renders; anything else falls back to initials", () => {
  const url = "https://zcmhkpsjwxzcisiwtgxi.supabase.co/storage/v1/object/public/candidate_photos/a/1.jpeg";
  expect(avatarPhotoSrc(url)).toBe(url);
  for (const bad of [null, undefined, "", "   ", "http://x/y.png", "javascript:alert(1)", "/relative.png", "data:image/png;base64,AA"]) {
    expect(avatarPhotoSrc(bad as string | null | undefined), String(bad)).toBeNull();
  }
});

const src = (f: string) => fs.readFileSync(path.join(__dirname, "../../src", f), "utf8");

test("the candidate list passes each candidate's photo to the avatar", () => {
  expect(src("app/candidates/page.tsx")).toMatch(/<Avatar name=\{c\.full_name\} photoUrl=\{c\.photo_url\}/);
});

test("the candidate profile header passes the photo", () => {
  expect(src("app/candidates/[id]/page.tsx")).toMatch(/<Avatar name=\{cand\.full_name\} size="lg" photoUrl=\{cand\.photo_url\}/);
});

test("the /applications card shows a prospect avatar with the photo", () => {
  expect(src("app/applications/IntakeCard.tsx")).toMatch(/<Avatar name=\{intake\.full_name \?\? "\?"\} photoUrl=\{photoUrl\}/);
  expect(src("app/applications/page.tsx")).toMatch(/photoUrl=\{photoByIntake\[intake\.id\] \?\? null\}/);
});

test("a photo that fails to load falls back to initials, not a broken image", () => {
  const photo = src("components/AvatarPhoto.tsx");
  expect(photo).toMatch(/onError=\{\(\) => setFailed\(true\)\}/);
  expect(photo).toMatch(/if \(failed\) return <>\{fallback\}<\/>/);
});
