// Resolving a candidate's photo gallery, with the storage call injected.
//
// Pure — no "server-only", no Supabase import — so the guarantee that a photo
// outage cannot take down a candidate record is covered by the required CI
// gate instead of being taken on faith.
//
// ---------------------------------------------------------------------------
// WHY THIS IS SPLIT OUT
//
// The behaviour here was already correct. It was reported that this path could
// 500 the candidate page when storage errored; that does not reproduce.
// Measured 2026-07-23 against a local production build with the storage
// endpoint's socket destroyed mid-request, the page returned 200 and logged
// "[candidate-photos] list failed: fetch failed" — the `if (error || !data)`
// guard handled it, because storage-js wraps a fetch rejection in
// StorageUnknownError, which extends StorageError, so handleOperation() returns
// {data:null,error} instead of throwing.
//
// What was missing is that nothing said so. The page's fail-soft behaviour
// rested entirely on this branch inside a dependency:
//
//   catch (error) {
//     if (this.shouldThrowOnError) throw error;
//     if (isStorageError(error)) return { data: null, error };
//     throw error;                      // <-- still reachable
//   }
//
// A storage-js bump that reclassified fetch failures, or any non-StorageError
// raised on this path, would turn a missing avatar into a dead candidate
// record — and it would surface as a recruiter reporting a broken page, not as
// a failing test. This module owns the guarantee locally instead of inheriting
// it, and e2e/logic/candidate-photos.spec.ts pins it.
//
// The map is inside the guard too: getPublicUrl throwing partway through would
// otherwise leave the gallery half-built and take the page with it.
// ---------------------------------------------------------------------------

export type CandidatePhoto = {
  /** Full object path within the bucket, e.g. "<id>/1699.jpg". */
  path: string;
  /** Public URL. */
  url: string;
  /** File name. */
  name: string;
  isPrimary: boolean;
  createdAt: string | null;
};

/** One row as storage.list() returns it. */
export type StorageObject = {
  name: string;
  id: string | null;
  created_at?: string;
};

export type ResolvePhotosDeps = {
  candidateId: string;
  /** candidates.photo_url — the ONE primary, used by the Avatar. */
  primaryUrl: string | null;
  list: () => Promise<{
    data: StorageObject[] | null;
    error: { message: string } | null;
  }>;
  publicUrlFor: (path: string) => string;
  /** Injected so the server wrapper can log without this module importing one. */
  onError?: (message: string) => void;
};

/**
 * Never throws, never rejects. A photo gallery is decoration on a record that
 * a recruiter needs to be able to open; no failure to read it is worth the
 * whole page.
 */
export async function resolveCandidatePhotos(
  deps: ResolvePhotosDeps,
): Promise<CandidatePhoto[]> {
  try {
    const { data, error } = await deps.list();
    if (error || !data) {
      if (error) deps.onError?.(error.message);
      return [];
    }

    // THE REPORTED SYMPTOM. Storage answers 200, no error, and `data` is not an
    // array — an error envelope, an HTML page parsed as JSON, a wrapper object
    // from something in the middle. `if (error || !data)` above rejects only
    // null/undefined; every other non-array is truthy, reaches `.filter`, and
    // took the whole candidate record down:
    //
    //     TypeError: data.filter is not a function
    //       at listCandidatePhotos (candidate-photos.server.ts:35:6)
    //       at async CandidateDetailPage (page.tsx:48:95)   -> HTTP 500
    //
    // The try/catch below is NOT the answer to this, for two reasons. It turns
    // most of these into an empty gallery only by accident, reporting our own
    // crash message instead of the upstream problem — and it does nothing at
    // all for an array-LIKE object, which has .filter and .map, throws nothing,
    // and would hand a non-array back to a page that maps over it.
    if (!Array.isArray(data)) {
      deps.onError?.(
        `expected an array of storage objects, got ${
          data === null ? "null" : typeof data
        } — treating as no photos`,
      );
      return [];
    }

    return data
      // storage.list returns a folder placeholder row with a null id; rendering
      // it would produce a broken image tile.
      .filter((o) => o.name && o.id !== null)
      .map((o) => {
        const path = `${deps.candidateId}/${o.name}`;
        const url = deps.publicUrlFor(path);
        return {
          path,
          url,
          name: o.name,
          isPrimary: deps.primaryUrl != null && url === deps.primaryUrl,
          createdAt: o.created_at ?? null,
        };
      });
  } catch (e) {
    // The branch the dependency can still reach. Degrading to an empty gallery
    // is the whole point — see the header.
    deps.onError?.(e instanceof Error ? e.message : String(e));
    return [];
  }
}
