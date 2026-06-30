import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  listClientsForPicker,
  listContacts,
  listEmployeesForPicker,
} from "@/lib/legal-tasks.server";
import {
  CONTACT_ROLE_LABEL,
  CONTACT_ROLE_TONE,
  CONTACT_TYPE_LABEL,
  fmtDateTime,
} from "@/lib/legal-tasks";
import type { ContactRole, ContactType } from "@/lib/supabase/types";
import {
  createContact,
  markContacted,
  toggleContactFavorite,
} from "./actions";
import { ContactRowActions } from "./ContactRowActions";
import { getServerDictionary } from "@/lib/i18n/server";

const ROLES = Object.keys(CONTACT_ROLE_LABEL) as ContactRole[];
const TYPES = Object.keys(CONTACT_TYPE_LABEL) as ContactType[];

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const filterRole = (ROLES as string[]).includes(sp.role ?? "")
    ? (sp.role as ContactRole)
    : undefined;
  const search = (sp.q ?? "").trim() || undefined;

  const [contacts, clients, employees] = await Promise.all([
    listContacts({ role: filterRole, search }),
    listClientsForPicker(),
    listEmployeesForPicker(),
  ]);

  const allContacts = search || filterRole ? await listContacts() : contacts;
  const roleCounts = new Map<ContactRole, number>();
  for (const r of ROLES) roleCounts.set(r, 0);
  for (const c of allContacts) {
    if (c.role) roleCounts.set(c.role, (roleCounts.get(c.role) ?? 0) + 1);
  }

  const favoriteCount = allContacts.filter((c) => c.favorite).length;
  const tb = (await getServerDictionary()).topbar.contacts;

  return (
    <Shell>
      <Topbar
        crumb={tb.crumb}
        scriptWord={tb.scriptWord}
        title={tb.title}
        actions={
          <Link href="/tasks" className="dt-btn">
            Tasks →
          </Link>
        }
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <KPI label="Total" value={String(allContacts.length)} sub="in Rolodex" />
        <KPI label="Favorited" value={String(favoriteCount)} sub="starred" />
        <KPI
          label="With Email"
          value={String(allContacts.filter((c) => c.email).length)}
          sub="reachable"
        />
        <KPI
          label="With Phone"
          value={String(allContacts.filter((c) => c.phone || c.mobile_phone).length)}
          sub="dialable"
        />
      </div>

      <form
        method="GET"
        style={{
          display: "flex",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        <input
          type="search"
          name="q"
          defaultValue={search ?? ""}
          placeholder="Search name, email, company, phone…"
          className="dt-filter-input"
          style={{ flex: "1 1 280px", maxWidth: 420 }}
        />
        {filterRole && <input type="hidden" name="role" value={filterRole} />}
        <button type="submit" className="dt-btn">
          <span>Search</span>
        </button>
        {(search || filterRole) && (
          <Link href="/contacts" className="dt-btn dt-btn-ghost">
            Clear
          </Link>
        )}
      </form>

      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <Link href={`/contacts${search ? `?q=${encodeURIComponent(search)}` : ""}`} className={"dt-chip" + (!filterRole ? " active" : "")}>
          All · {allContacts.length}
        </Link>
        {ROLES.map((r) => {
          const count = roleCounts.get(r) ?? 0;
          if (count === 0 && r !== filterRole) return null;
          const params = new URLSearchParams();
          params.set("role", r);
          if (search) params.set("q", search);
          return (
            <Link
              key={r}
              href={`/contacts?${params.toString()}`}
              className={"dt-chip" + (filterRole === r ? " active" : "")}
            >
              {CONTACT_ROLE_LABEL[r]} · {count}
            </Link>
          );
        })}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 380px",
          gap: 22,
          alignItems: "start",
        }}
      >
        <div className="dt-card gold-edge">
          <div className="dt-card-head">
            <div>
              <h3>
                {contacts.length} {contacts.length === 1 ? "contact" : "contacts"}
              </h3>
              <div className="sub">
                {filterRole ? CONTACT_ROLE_LABEL[filterRole] : "All roles"}
                {search ? ` · "${search}"` : ""}
              </div>
            </div>
          </div>
          <div className="dt-table-wrap">
            <table className="dt-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 22 }}>Contact</th>
                  <th>Role</th>
                  <th>Company</th>
                  <th>Reach</th>
                  <th>Last Contacted</th>
                  <th style={{ textAlign: "right", paddingRight: 22 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((c) => {
                  const reachEmail = c.email ?? c.secondary_email;
                  const reachPhone = c.phone ?? c.mobile_phone ?? c.work_phone;
                  return (
                    <tr key={c.id}>
                      <td style={{ paddingLeft: 22 }}>
                        <div className="dt-person" style={{ alignItems: "center" }}>
                          <Avatar name={c.full_name ?? "?"} />
                          <div>
                            <div className="name" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                              {c.favorite && (
                                <span style={{ color: "var(--dt-gold-deep)", fontSize: 11 }}>★</span>
                              )}
                              {c.full_name ?? "(no name)"}
                            </div>
                            <div className="meta">
                              {c.title ?? CONTACT_TYPE_LABEL[c.type]}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        {c.role ? (
                          <Badge tone={CONTACT_ROLE_TONE[c.role]}>
                            {CONTACT_ROLE_LABEL[c.role]}
                          </Badge>
                        ) : (
                          <span className="muted" style={{ fontSize: 11 }}>—</span>
                        )}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {c.company ?? c.client?.name ?? "—"}
                      </td>
                      <td style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                        {reachEmail && (
                          <div>
                            <a
                              href={`mailto:${reachEmail}`}
                              style={{ color: "var(--dt-gold-deep)" }}
                            >
                              {reachEmail}
                            </a>
                          </div>
                        )}
                        {reachPhone && (
                          <div className="tab-num">
                            <a
                              href={`tel:${reachPhone}`}
                              style={{ color: "var(--dt-warm-700)" }}
                            >
                              {reachPhone}
                            </a>
                          </div>
                        )}
                        {!reachEmail && !reachPhone && (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="tab-num muted" style={{ fontSize: 11.5 }}>
                        {c.last_contacted_at
                          ? fmtDateTime(c.last_contacted_at)
                          : "—"}
                      </td>
                      <td
                        style={{
                          textAlign: "right",
                          paddingRight: 22,
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          alignItems: "flex-end",
                        }}
                      >
                        <form
                          action={async () => {
                            "use server";
                            await markContacted(c.id);
                          }}
                        >
                          <button
                            type="submit"
                            className="dt-btn dt-btn-ghost"
                            style={{ padding: "2px 8px", fontSize: 9, letterSpacing: "0.14em" }}
                          >
                            <span>Log Touch</span>
                          </button>
                        </form>
                        <form
                          action={async () => {
                            "use server";
                            await toggleContactFavorite(c.id, !c.favorite);
                          }}
                        >
                          <button
                            type="submit"
                            className="dt-btn dt-btn-ghost"
                            style={{ padding: "2px 8px", fontSize: 9, letterSpacing: "0.14em" }}
                          >
                            <span>{c.favorite ? "Unstar" : "Star"}</span>
                          </button>
                        </form>
                        <ContactRowActions
                          contact={c}
                          clients={clients}
                          employees={employees}
                        />
                      </td>
                    </tr>
                  );
                })}
                {contacts.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{
                        textAlign: "center",
                        padding: "48px 22px",
                        color: "var(--dt-warm-500)",
                        fontStyle: "italic",
                      }}
                    >
                      No contacts matched.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="dt-card" style={{ padding: 0 }}>
          <div className="dt-card-head">
            <div>
              <h3>Add Contact</h3>
              <div className="sub">Rolodex entry — search jumps right to it</div>
            </div>
          </div>
          <form
            action={createContact}
            style={{ padding: "18px 22px", display: "flex", flexDirection: "column", gap: 12 }}
          >
            <Field label="Full Name">
              <input name="full_name" type="text" required className="dt-filter-input" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Type">
                <select name="type" required defaultValue="other" className="dt-filter-input">
                  {TYPES.map((t) => (
                    <option key={t} value={t}>{CONTACT_TYPE_LABEL[t]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Role">
                <select name="role" defaultValue="" className="dt-filter-input">
                  <option value="">—</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{CONTACT_ROLE_LABEL[r]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Title">
                <input name="title" type="text" className="dt-filter-input" placeholder="HR Director" />
              </Field>
              <Field label="Company">
                <input name="company" type="text" className="dt-filter-input" />
              </Field>
            </div>
            <Field label="Email">
              <input name="email" type="email" className="dt-filter-input" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Phone">
                <input name="phone" type="tel" className="dt-filter-input" placeholder="(555) 555-5555" />
              </Field>
              <Field label="Mobile">
                <input name="mobile_phone" type="tel" className="dt-filter-input" />
              </Field>
            </div>
            <Field label="LinkedIn URL">
              <input name="linkedin_url" type="url" className="dt-filter-input" />
            </Field>
            <Field label="Address line">
              <input name="address_line1" type="text" className="dt-filter-input" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 10 }}>
              <Field label="City">
                <input name="city" type="text" className="dt-filter-input" />
              </Field>
              <Field label="State">
                <input name="state" type="text" className="dt-filter-input" />
              </Field>
              <Field label="ZIP">
                <input name="postal_code" type="text" className="dt-filter-input" />
              </Field>
            </div>
            <Field label="Birthday">
              <input name="birthday" type="date" className="dt-filter-input" />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field label="Linked Client">
                <select name="client_id" className="dt-filter-input" defaultValue="">
                  <option value="">—</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Linked Employee">
                <select name="employee_id" className="dt-filter-input" defaultValue="">
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>{e.full_name}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Source (how did we get them?)">
              <input name="source" type="text" className="dt-filter-input" placeholder="Referral / website / event" />
            </Field>
            <Field label="Internal owner">
              <input name="owner" type="text" className="dt-filter-input" placeholder="Rocio / Roxanna / …" />
            </Field>
            <Field label="Tags (comma-separated)">
              <input name="tags" type="text" className="dt-filter-input" placeholder="vip, q2, conference-2026" />
            </Field>
            <Field label="Notes">
              <textarea
                name="notes"
                rows={3}
                className="dt-filter-input"
                style={{ resize: "vertical", minHeight: 60 }}
              />
            </Field>
            <button type="submit" className="dt-btn dt-btn-primary" style={{ marginTop: 4 }}>
              <span>+ Add Contact</span>
            </button>
          </form>
        </aside>
      </div>

    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="dt-filter">
      <span className="dt-filter-label">{label}</span>
      {children}
    </label>
  );
}

function KPI({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="dt-card" style={{ padding: "18px 20px" }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 8 }}>
        <div
          className="tab-num"
          style={{
            fontFamily: "var(--dt-display)",
            fontSize: 28,
            fontWeight: 300,
            letterSpacing: "-0.01em",
          }}
        >
          {value}
        </div>
        {sub && <div style={{ fontSize: 11.5, color: "var(--dt-warm-500)" }}>{sub}</div>}
      </div>
    </div>
  );
}
