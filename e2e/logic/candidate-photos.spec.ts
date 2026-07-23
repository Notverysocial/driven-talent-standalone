import { test, expect } from "@playwright/test";
import { resolveCandidatePhotos } from "../../src/lib/candidate-photos";

// The candidate page must render when photo storage is unavailable.
//
// ---------------------------------------------------------------------------
// WHAT THIS IS, AND WHAT IT IS NOT
//
// It is NOT a fix for a reproduced crash. It was reported that
// listCandidatePhotos() could 500 the candidate page when storage errored, and
// that does not reproduce: measured 2026-07-23 against a local production build
// with the storage endpoint's socket destroyed mid-request, the page returned
// 200 and logged "[candidate-photos] list failed: fetch failed". The existing
// `if (error || !data) return []` guard already covers it, because storage-js
// wraps a fetch rejection in StorageUnknownError — which extends StorageError,
// so handleOperation() returns {data:null,error} rather than throwing.
//
// It IS a regression test plus one narrowing, for a guarantee that is currently
// accidental rather than stated:
//
//   handleOperation(op) {
//     try { return { data: await op(), error: null } }
//     catch (error) {
//       if (this.shouldThrowOnError) throw error;
//       if (isStorageError(error)) return { data: null, error };
//       throw error;                      // <-- still reachable
//     }
//   }
//
// Everything the page's fail-soft behaviour depends on lives in that
// `isStorageError` branch, inside a dependency, and nothing in this repo
// asserted it. A storage-js bump that reclassified fetch failures, or any
// non-StorageError thrown on this path, would turn a missing avatar into a dead
// candidate record — and we would find out from a recruiter, not from CI.
//
// So: the behaviour is pinned here, and resolveCandidatePhotos catches rather
// than relying on the library to classify correctly on our behalf.
// ---------------------------------------------------------------------------

const obj = (name: string, id: string | null = "id-1") => ({
  name,
  id,
  created_at: "2026-07-01T00:00:00Z",
});

const urlFor = (path: string) => `https://cdn.example.com/${path}`;

test.describe("resolveCandidatePhotos — never takes the page down", () => {
  test("THE GUARANTEE: the lister REJECTING degrades to no photos", () => {
    // The branch storage-js can still reach via `throw error`.
    return expect(
      resolveCandidatePhotos({
        candidateId: "c1",
        primaryUrl: null,
        list: async () => {
          throw new TypeError("fetch failed");
        },
        publicUrlFor: urlFor,
      }),
    ).resolves.toEqual([]);
  });

  test("a returned storage error degrades to no photos", async () => {
    expect(
      await resolveCandidatePhotos({
        candidateId: "c1",
        primaryUrl: null,
        list: async () => ({ data: null, error: { message: "bucket not found" } }),
        publicUrlFor: urlFor,
      }),
    ).toEqual([]);
  });

  test("a null data set with no error also degrades", async () => {
    expect(
      await resolveCandidatePhotos({
        candidateId: "c1",
        primaryUrl: null,
        list: async () => ({ data: null, error: null }),
        publicUrlFor: urlFor,
      }),
    ).toEqual([]);
  });

  test("publicUrlFor throwing mid-map degrades rather than half-rendering", async () => {
    expect(
      await resolveCandidatePhotos({
        candidateId: "c1",
        primaryUrl: null,
        list: async () => ({ data: [obj("a.jpg"), obj("b.jpg")], error: null }),
        publicUrlFor: () => {
          throw new Error("url builder blew up");
        },
      }),
    ).toEqual([]);
  });

  test("the happy path still maps every photo", async () => {
    const out = await resolveCandidatePhotos({
      candidateId: "c1",
      primaryUrl: null,
      list: async () => ({ data: [obj("a.jpg"), obj("b.jpg")], error: null }),
      publicUrlFor: urlFor,
    });
    expect(out.map((p) => p.path)).toEqual(["c1/a.jpg", "c1/b.jpg"]);
    expect(out[0].url).toBe("https://cdn.example.com/c1/a.jpg");
  });

  test("the storage placeholder row (id === null) is skipped", async () => {
    // storage.list returns a folder placeholder with a null id; rendering it
    // would produce a broken image tile.
    const out = await resolveCandidatePhotos({
      candidateId: "c1",
      primaryUrl: null,
      list: async () => ({
        data: [obj(".emptyFolderPlaceholder", null), obj("real.jpg")],
        error: null,
      }),
      publicUrlFor: urlFor,
    });
    expect(out.map((p) => p.name)).toEqual(["real.jpg"]);
  });

  test("isPrimary matches the candidate's stored photo_url", async () => {
    const out = await resolveCandidatePhotos({
      candidateId: "c1",
      primaryUrl: "https://cdn.example.com/c1/b.jpg",
      list: async () => ({ data: [obj("a.jpg"), obj("b.jpg")], error: null }),
      publicUrlFor: urlFor,
    });
    expect(out.find((p) => p.name === "b.jpg")?.isPrimary).toBe(true);
    expect(out.find((p) => p.name === "a.jpg")?.isPrimary).toBe(false);
  });

  test("no photos is an empty list, not an error", async () => {
    expect(
      await resolveCandidatePhotos({
        candidateId: "c1",
        primaryUrl: null,
        list: async () => ({ data: [], error: null }),
        publicUrlFor: urlFor,
      }),
    ).toEqual([]);
  });
});
