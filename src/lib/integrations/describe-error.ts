// Turn an opaque thrown value into something an operator can act on.
//
// WHY: on 2026-07-19 the uAttend integration recorded `last_error = "fetch
// failed"`. That is Node/undici's generic message for ANY network-layer
// failure — DNS, refused connection, TLS, timeout — and it names neither the
// host nor the reason. Diagnosing it took a manual DNS lookup, and the answer
// (`api.uattend.com` does not exist) was sitting in `err.cause` the whole time.
//
// Every provider was throwing that detail away:
//
//     error: e instanceof Error ? e.message : "provider_fetch_failed"
//
// `e.message` is "fetch failed". `e.cause` is
// `Error: getaddrinfo ENOTFOUND api.uattend.com` with `.code` and `.hostname`.
// One is a shrug; the other is the diagnosis.
//
// The rule this encodes: an error string written to a database column that a
// human will read later must say WHAT failed and WHY. If we cannot answer
// those from the error object, we say so explicitly rather than emitting a
// message that looks informative and isn't.

/**
 * Node attaches a `cause` to fetch failures (undici). It is not in the base
 * Error type, and carries libuv/undici fields we want in the message.
 */
type ErrorWithCause = Error & {
  cause?: unknown;
};

type CauseFields = {
  code?: string;
  errno?: number;
  hostname?: string;
  syscall?: string;
  message?: string;
};

function readCause(err: unknown): CauseFields | null {
  if (!(err instanceof Error)) return null;
  const cause = (err as ErrorWithCause).cause;
  if (!cause || typeof cause !== "object") return null;
  const c = cause as Record<string, unknown>;
  return {
    code: typeof c.code === "string" ? c.code : undefined,
    errno: typeof c.errno === "number" ? c.errno : undefined,
    hostname: typeof c.hostname === "string" ? c.hostname : undefined,
    syscall: typeof c.syscall === "string" ? c.syscall : undefined,
    message: typeof c.message === "string" ? c.message : undefined,
  };
}

/**
 * Build the string we persist to `integrations.last_error`.
 *
 * `fetch failed`                        → `fetch failed: getaddrinfo ENOTFOUND
 *                                          api.uattend.com [ENOTFOUND]`
 * an Error with no cause                → its own message, unchanged
 * a non-Error throw                     → the fallback label plus the value
 *
 * @param fallback provider-specific label used when the throw is not an Error
 */
export function describeError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) {
    // A thrown string / object / undefined. Say what it was rather than
    // pretending it was a network failure.
    const rendered =
      err === undefined || err === null ? String(err) : safeStringify(err);
    return `${fallback}: non-Error thrown (${rendered})`;
  }

  // An Error can carry an empty message (`new Error()`), which would otherwise
  // write a blank string into last_error — the most useless value of all.
  const base = err.message.trim() || fallback;

  const cause = readCause(err);
  if (!cause) return base;

  // Prefer the cause's own message — it is the one naming the host and syscall.
  const detail = cause.message ?? "";
  const bits: string[] = [];
  if (detail && detail !== base) bits.push(detail);
  if (cause.code) bits.push(`[${cause.code}]`);
  // Only add the hostname when the cause message did not already include it.
  if (cause.hostname && !detail.includes(cause.hostname)) {
    bits.push(`host=${cause.hostname}`);
  }

  return bits.length > 0 ? `${base}: ${bits.join(" ")}` : base;
}

/**
 * True when the failure is DNS — the host does not resolve. Worth
 * distinguishing because it means the URL is wrong in the code or config, not
 * that the credential or the remote service is at fault. No credential is even
 * sent: resolution fails first.
 */
export function isDnsFailure(err: unknown): boolean {
  const cause = readCause(err);
  return cause?.code === "ENOTFOUND" || cause?.code === "EAI_AGAIN";
}

function safeStringify(v: unknown): string {
  try {
    const s = typeof v === "string" ? v : JSON.stringify(v);
    return (s ?? String(v)).slice(0, 200);
  } catch {
    return String(v).slice(0, 200);
  }
}
