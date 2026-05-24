// Provider-agnostic e-signature interface.
//
// Replaces the legacy PandaDocs link-in-email approach with a thin abstraction
// so the active provider can be swapped via env var without touching the
// onboarding UI. Documenso (open-source, self-hostable, ~10× cheaper than
// PandaDocs) is the default; DocuSeal, Dropbox Sign, and a manual fallback
// are wired in for when a different setup is preferred per-client.
//
// IMPORTANT: do not call provider HTTP APIs from this file directly — the
// adapter implementations below handle that. Callers should only depend on
// the EsignProvider interface and getActiveProvider().

import type { EsignProvider as ProviderKey } from "../team";

export type CreateRequestInput = {
  documentKind: string;
  documentTitle: string;
  recipientName: string;
  recipientEmail: string;
  templateBody?: string;            // free-text body for letter-style docs
  templateId?: string;              // provider-side template id, when used
  metadata?: Record<string, string>;
};

export type CreateRequestResult = {
  providerRequestId: string;
  signingUrl: string | null;        // null if the provider emails the link directly
};

export type ProviderStatus = "configured" | "missing_credentials" | "stub";

export interface EsignProvider {
  readonly key: ProviderKey;
  readonly label: string;
  status(): ProviderStatus;
  createRequest(input: CreateRequestInput): Promise<CreateRequestResult>;
}

// ---------- Documenso (default) -----------------------------------------
// API docs: https://documenso.com/docs/api
// Self-hostable open-source platform; commercial cloud is ~$30/mo for 500
// signatures vs PandaDocs $89/user/mo. Use the templates endpoint for
// the canned Welcome Letter + Agreement & Expectations PDFs, and the
// direct-link endpoint for ad-hoc letters.

class DocumensoProvider implements EsignProvider {
  readonly key = "documenso" as const;
  readonly label = "Documenso";

  status(): ProviderStatus {
    if (!process.env.DOCUMENSO_API_URL || !process.env.DOCUMENSO_API_TOKEN) {
      return "missing_credentials";
    }
    return "configured";
  }

  async createRequest(input: CreateRequestInput): Promise<CreateRequestResult> {
    if (this.status() !== "configured") {
      return stubCreate(input, "documenso");
    }
    const base = process.env.DOCUMENSO_API_URL!.replace(/\/$/, "");
    const token = process.env.DOCUMENSO_API_TOKEN!;
    const body = input.templateId
      ? {
          templateId: input.templateId,
          recipients: [{ name: input.recipientName, email: input.recipientEmail, role: "SIGNER" }],
          meta: { title: input.documentTitle, ...input.metadata },
        }
      : {
          title: input.documentTitle,
          recipients: [{ name: input.recipientName, email: input.recipientEmail, role: "SIGNER" }],
          meta: { subject: input.documentTitle, message: input.templateBody ?? "" },
        };
    const res = await fetch(`${base}/api/v1/documents`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Documenso createDocument failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { id?: string | number; documentId?: string; signingUrl?: string };
    const providerRequestId = String(json.id ?? json.documentId ?? "");
    return { providerRequestId, signingUrl: json.signingUrl ?? null };
  }
}

// ---------- DocuSeal -----------------------------------------------------
// API docs: https://www.docuseal.com/docs/api
// Another open-source alternative; same price tier as Documenso. Wired
// in so an operator can switch via ESIGN_PROVIDER=docuseal without code
// changes.

class DocuSealProvider implements EsignProvider {
  readonly key = "docuseal" as const;
  readonly label = "DocuSeal";

  status(): ProviderStatus {
    if (!process.env.DOCUSEAL_API_URL || !process.env.DOCUSEAL_API_TOKEN) {
      return "missing_credentials";
    }
    return "configured";
  }

  async createRequest(input: CreateRequestInput): Promise<CreateRequestResult> {
    if (this.status() !== "configured") {
      return stubCreate(input, "docuseal");
    }
    const base = process.env.DOCUSEAL_API_URL!.replace(/\/$/, "");
    const token = process.env.DOCUSEAL_API_TOKEN!;
    if (!input.templateId) {
      throw new Error("DocuSeal requires a templateId");
    }
    const res = await fetch(`${base}/api/submissions`, {
      method: "POST",
      headers: { "X-Auth-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({
        template_id: input.templateId,
        submitters: [{ name: input.recipientName, email: input.recipientEmail, role: "Signer" }],
      }),
    });
    if (!res.ok) {
      throw new Error(`DocuSeal createSubmission failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as Array<{ id?: number; slug?: string; url?: string }>;
    const first = Array.isArray(json) ? json[0] : (json as unknown as { id?: number; slug?: string; url?: string });
    return {
      providerRequestId: String(first?.id ?? first?.slug ?? ""),
      signingUrl: first?.url ?? null,
    };
  }
}

// ---------- Manual fallback ---------------------------------------------
// No external API — the operator prints, signs in person, scans, and
// records the signed PDF path. Always available; used when ESIGN_PROVIDER
// is unset or 'manual'. Also serves as the stub when other providers have
// no credentials yet so the UI doesn't break in dev / preview.

class ManualProvider implements EsignProvider {
  readonly key = "manual" as const;
  readonly label = "Manual / printed";

  status(): ProviderStatus {
    return "configured";
  }

  async createRequest(input: CreateRequestInput): Promise<CreateRequestResult> {
    return stubCreate(input, "manual");
  }
}

function stubCreate(input: CreateRequestInput, providerKey: ProviderKey): CreateRequestResult {
  // Deterministic local id so the row has something we can search for
  // later even without a real provider response.
  const id = `${providerKey}-stub-${Date.now()}`;
  return { providerRequestId: id, signingUrl: null };
}

// ---------- Registry / resolver ------------------------------------------

const REGISTRY = new Map<ProviderKey, EsignProvider>([
  ["documenso", new DocumensoProvider()],
  ["docuseal", new DocuSealProvider()],
  ["manual", new ManualProvider()],
]);

export function getProvider(key: ProviderKey): EsignProvider {
  const p = REGISTRY.get(key);
  if (p) return p;
  // dropbox_sign / pandadocs are recognized in the DB enum but not in the
  // active adapter set — fall back to manual so historical rows still
  // resolve to a renderable provider object.
  return REGISTRY.get("manual")!;
}

export function getActiveProvider(): EsignProvider {
  const key = (process.env.ESIGN_PROVIDER as ProviderKey | undefined) ?? "documenso";
  const p = getProvider(key);
  // If the configured provider is missing credentials, gracefully fall
  // back to manual so the onboarding flow still works in dev/preview.
  if (p.status() === "missing_credentials") return REGISTRY.get("manual")!;
  return p;
}
