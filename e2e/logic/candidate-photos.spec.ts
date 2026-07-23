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

  // -------------------------------------------------------------------------
  // THE REPORTED SYMPTOM: storage answers 200, with no error, and `data` is
  // not an array.
  //
  // Reproduced on main 2026-07-23 with a stub returning `{"message": "..."}`:
  //
  //     HTTP 500
  //     TypeError: data.filter is not a function
  //       at listCandidatePhotos (src/lib/candidate-photos.server.ts:35:6)
  //       at async CandidateDetailPage (src/app/candidates/[id]/page.tsx:48:95)
  //
  // `if (error || !data)` only rejects null/undefined. Every other non-array —
  // an error envelope, an HTML page parsed as JSON, a wrapper object from a
  // proxy — is truthy, reaches `.filter`, and takes the candidate record down.
  //
  // A try/catch alone is NOT a sufficient answer here. It converts most of
  // these into an empty gallery by accident, via a TypeError whose message
  // ("data.filter is not a function") describes our own crash rather than the
  // upstream problem — and it does nothing at all for an array-LIKE object,
  // which has .filter and .map, throws nothing, and hands a non-array straight
  // to the page. Hence an explicit Array.isArray check.
  // -------------------------------------------------------------------------
  const NON_ARRAYS: [string, unknown][] = [
    ["a bare object", {}],
    ["an error envelope", { message: "unexpected envelope" }],
    ["a wrapper object", { data: [{ name: "a.jpg", id: "1" }] }],
    ["a string", "a string"],
    ["a number", 123],
    ["a boolean", true],
  ];

  for (const [label, data] of NON_ARRAYS) {
    test(`THE TICKET: ${label} with no error degrades to no photos`, async () => {
      const out = await resolveCandidatePhotos({
        candidateId: "c1",
        primaryUrl: null,
        list: async () => ({ data: data as never, error: null }),
        publicUrlFor: urlFor,
      });
      expect(Array.isArray(out), "the page needs a real array back").toBe(true);
      expect(out).toEqual([]);
    });
  }

  test("THE HOLE A try/catch MISSES: an array-LIKE object", async () => {
    // Has .filter and .map, so nothing throws and a catch never fires — but
    // what comes back is not an array, and the page maps over it.
    const arrayLike = {
      filter: () => ({ map: () => "NOT AN ARRAY" }),
    };
    const out = await resolveCandidatePhotos({
      candidateId: "c1",
      primaryUrl: null,
      list: async () => ({ data: arrayLike as never, error: null }),
      publicUrlFor: urlFor,
    });
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual([]);
  });

  test("the non-array case is REPORTED, not silently swallowed", async () => {
    // Degrading quietly is how this class of bug survives. Name it.
    const seen: string[] = [];
    await resolveCandidatePhotos({
      candidateId: "c1",
      primaryUrl: null,
      list: async () => ({ data: {} as never, error: null }),
      publicUrlFor: urlFor,
      onError: (m) => seen.push(m),
    });
    expect(seen.length).toBe(1);
    expect(seen[0].toLowerCase()).toContain("array");
  });

  test("a real array is still not mistaken for a bad shape", async () => {
    const out = await resolveCandidatePhotos({
      candidateId: "c1",
      primaryUrl: null,
      list: async () => ({ data: [obj("a.jpg")], error: null }),
      publicUrlFor: urlFor,
    });
    expect(out).toHaveLength(1);
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
