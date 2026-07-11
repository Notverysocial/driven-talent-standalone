// Shared helpers for the threaded notes log (migration 0038). Pure — no server
// imports — so both the client editor and the server action can parse mentions.

import type { NoteMention } from "./supabase/types";

// Extract @mentions from a note body. Matches "@Name" and "@First Last" (a
// single optional capitalized second word), case-insensitive on the token.
// Returns de-duplicated {name} objects; the server action resolves each name
// against the recruiters roster / team_members to attach a team_member_id.
export function parseMentions(body: string): NoteMention[] {
  const out: NoteMention[] = [];
  const seen = new Set<string>();
  // @ followed by a word, optionally a second word (e.g. "@Maria Lopez").
  const re = /@([A-Za-z][\w'-]*(?:\s+[A-Z][\w'-]*)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].trim();
    const key = name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ name });
    }
  }
  return out;
}
