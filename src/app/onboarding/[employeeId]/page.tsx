import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  generateWelcomeLetterBody,
  getOnboardingDetail,
  getPeopleaseForms,
} from "@/lib/onboarding.server";
import { ONBOARDING_TEMPLATE, calcProgress } from "@/lib/onboarding";
import { listEsignatureRequestsForEmployee, listTeamMembers } from "@/lib/team.server";
import { listItemMentions } from "@/lib/notifications.server";
import { CalendlyScheduler } from "@/components/CalendlyScheduler";
import { getCalendlySchedulingContext } from "@/lib/integrations/calendly-scheduling.server";
import {
  buildCalendlyBookingUrl,
  CALENDLY_EVENT_TYPES,
} from "@/lib/integrations/calendly-events";
import { ItemRow } from "./ItemRow";
import { OnboardingStatusToggle } from "./OnboardingStatusToggle";
import { PeopleaseFormsPanel } from "./PeopleaseFormsPanel";
import { WelcomeLetter } from "./WelcomeLetter";
import { EsignaturePanel } from "./EsignaturePanel";
import { LanguagePrefSelect } from "@/components/LanguagePrefSelect";
import { CandidateNotes } from "@/components/CandidateNotes";
import { listNotes } from "@/lib/candidate-notes.server";
import {
  addChecklistItem,
  addDocument,
  setEmployeeLanguagePref,
  toggleDocument,
} from "../actions";
import { getActiveEsignProviderInfo } from "../esign-actions";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function OnboardingDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const detail = await getOnboardingDetail(employeeId);
  if (!detail) notFound();

  const { employee, checklist, documents, primaryAssignment, welcomeLetter } = detail;
  const [esignRequests, providerInfo, peopleaseForms, teamMembers, mentionsByItem] =
    await Promise.all([
      listEsignatureRequestsForEmployee(employeeId),
      getActiveEsignProviderInfo(),
      getPeopleaseForms(employeeId),
      listTeamMembers(),
      listItemMentions(checklist.map((i) => i.id)),
    ]);
  // Active teammates only for the @mention picker.
  const taggableTeam = teamMembers
    .filter((m) => m.status === "active")
    .map((m) => ({ id: m.id, full_name: m.full_name, title: m.title }));
  const progress = calcProgress(checklist);
  const orderByKey = new Map(ONBOARDING_TEMPLATE.map((t) => [t.key, t.ord]));
  const generated = generateWelcomeLetterBody(employee, primaryAssignment);

  // Shared threaded notes log — same component reused on the onboarding record
  // (Estefany 2026-07-06). subject_type "onboarding", keyed by employee id.
  const onboardingNotes = await listNotes("onboarding", employeeId);

  // Calendly — book the new-hire orientation, prefilled with the employee's
  // name/email so the booking reconciles back to them via the webhook.
  const cal = await getCalendlySchedulingContext();
  const onboardingOptions = cal.schedulingUrl
    ? [
        {
          key: "onboarding",
          label: "Schedule Orientation",
          durationMinutes: CALENDLY_EVENT_TYPES.onboarding.durationMinutes,
          url: buildCalendlyBookingUrl({
            schedulingUrl: cal.schedulingUrl,
            slug: cal.eventSlugs.onboarding,
            name: employee.full_name,
            email: employee.email,
          }),
        },
      ]
    : [];

  return (
    <Shell>
      <Topbar
        crumb={`HR / ONBOARDING / ${employee.full_name.toUpperCase()}`}
        scriptWord="Onboarding "
        title="Tracker"
        actions={
          <>
            <Link href="/onboarding" className="dt-btn">
              ← All Onboarding
            </Link>
            <Link href={`/employees/${employee.id}`} className="dt-btn">
              Profile
            </Link>
          </>
        }
      />

      {/* General info card */}
      <div
        className="dt-card gold-edge"
        style={{
          padding: "22px 26px",
          marginBottom: 22,
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 24,
          alignItems: "flex-start",
        }}
      >
        <Avatar name={employee.full_name} size="lg" />
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "var(--dt-display)", fontSize: 24, fontWeight: 300 }}>
            {employee.full_name}
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
            <Badge tone={progress.pct === 100 ? "green" : "amber"}>
              {progress.done}/{progress.relevant} done · {progress.pct}%
            </Badge>
            {employee.recruiter && <Badge tone="warm">Recruiter: {employee.recruiter}</Badge>}
            {employee.onboarding_in_charge && (
              <Badge tone="warm">In charge: {employee.onboarding_in_charge}</Badge>
            )}
          </div>

          {/* Active toggle — decoupled from checklist completion (Phase-1 #1).
              Only shown for the onboarding ⇄ active pair. */}
          {(employee.status === "onboarding" || employee.status === "active") && (
            <div style={{ marginTop: 12 }}>
              <OnboardingStatusToggle
                employeeId={employee.id}
                status={employee.status}
                complete={progress.pct === 100}
              />
            </div>
          )}

          {/* Document-language preference — drives the language onboarding docs
              are generated in (task 86e20w8yz). */}
          <div style={{ marginTop: 12 }}>
            <LanguagePrefSelect
              current={employee.language_pref}
              action={setEmployeeLanguagePref.bind(null, employee.id)}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: 16,
              marginTop: 18,
              fontSize: 12.5,
            }}
          >
            <Field label="Phone" value={employee.phone ?? "—"} mono />
            <Field label="Email" value={employee.email ?? "—"} />
            <Field label="Company" value={primaryAssignment?.client.name ?? "—"} />
            <Field label="Position" value={primaryAssignment?.position ?? "—"} />
            <Field
              label="Rate"
              value={
                primaryAssignment
                  ? `$${Number(primaryAssignment.hourly_rate).toFixed(2)}/hr`
                  : "—"
              }
              mono
            />
            <Field label="Start Date" value={fmtDate(primaryAssignment?.start_date ?? employee.hire_date)} />
            <Field label="Recruiter" value={employee.recruiter ?? "—"} />
            <Field label="Onboarding In Charge" value={employee.onboarding_in_charge ?? "—"} />
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 18 }}>
            <div
              style={{
                height: 6,
                background: "var(--dt-warm-100)",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${progress.pct}%`,
                  height: "100%",
                  background:
                    progress.pct === 100 ? "var(--dt-success)" : "var(--dt-gold)",
                  transition: "width 200ms",
                }}
              />
            </div>
          </div>
        </div>
      </div>

      <div
        className="dt-card"
        style={{
          padding: "16px 22px",
          marginBottom: 22,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            className="tiny muted"
            style={{
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 400,
            }}
          >
            Orientation
          </div>
          <div style={{ fontSize: 12.5, color: "var(--dt-warm-500)", marginTop: 4 }}>
            Book the new-hire onboarding session via Calendly.
          </div>
        </div>
        <CalendlyScheduler
          connected={cal.connected}
          options={onboardingOptions}
          size="sm"
          emptyHint="Connect Calendly in Integrations to schedule orientation."
        />
      </div>

      <WelcomeLetter
        employeeId={employee.id}
        initialBody={welcomeLetter?.body ?? null}
        generatedBody={generated}
        sentAt={welcomeLetter?.sent_at ?? null}
      />

      <EsignaturePanel
        employeeId={employee.id}
        recipientName={employee.full_name}
        recipientEmail={employee.email ?? ""}
        requests={esignRequests}
        provider={providerInfo}
      />

      {/* 13-item checklist */}
      <div className="dt-card" style={{ marginTop: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Onboarding Checklist</h3>
            <div className="sub">
              13 standard items · status flips Not Started → In Progress → Done; mark N/A to exclude from progress
            </div>
          </div>
        </div>
        <div>
          {checklist.map((i) => (
            <ItemRow
              key={i.id}
              itemId={i.id}
              employeeId={employee.id}
              ord={orderByKey.get(i.key) ?? 0}
              label={i.label}
              detail={i.detail}
              status={i.status}
              doneOn={i.done_on}
              notes={i.notes}
              teamMembers={taggableTeam}
              mentions={mentionsByItem.get(i.id) ?? []}
            />
          ))}
        </div>

        <form
          action={addChecklistItem.bind(null, employee.id)}
          style={{
            margin: "8px 18px 18px",
            padding: "14px 16px",
            background: "var(--dt-warm-50)",
            border: "1px dashed var(--dt-warm-200)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--dt-warm-500)",
              fontWeight: 400,
              marginBottom: 10,
            }}
          >
            Add a custom checklist item
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 8 }}>
            <input name="label" placeholder="Step label" className="dt-filter-input" required />
            <select name="category" className="dt-filter-input" defaultValue="Documentation">
              <option value="Documentation">Documentation</option>
              <option value="Compliance">Compliance</option>
              <option value="Training">Training</option>
              <option value="Equipment">Equipment</option>
              <option value="Review">Review</option>
            </select>
            <button type="submit" className="dt-btn">
              Add
            </button>
          </div>
          <input
            name="detail"
            placeholder="Optional detail / instructions"
            className="dt-filter-input"
            style={{ width: "100%", marginTop: 8 }}
          />
        </form>
      </div>

      {/* PEOPLEASE new-hire forms packet (task 86e20w8v9) */}
      <PeopleaseFormsPanel employeeId={employee.id} forms={peopleaseForms} />

      {/* Documents */}
      <div className="dt-card" style={{ marginTop: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Document Folder</h3>
            <div className="sub">Click to flip received status</div>
          </div>
        </div>
        <div>
          {documents.map((d, i) => (
            <DocRow
              key={d.id}
              docId={d.id}
              employeeId={employee.id}
              name={d.name}
              received={d.received}
              receivedOn={d.received_on}
              isLast={i === documents.length - 1}
            />
          ))}
          {documents.length === 0 && (
            <div
              style={{
                padding: "20px 22px",
                fontSize: 12,
                color: "var(--dt-warm-500)",
                fontStyle: "italic",
                textAlign: "center",
              }}
            >
              No documents required.
            </div>
          )}
        </div>

        <form
          action={addDocument.bind(null, employee.id)}
          style={{
            margin: "8px 18px 18px",
            padding: "12px 14px",
            background: "var(--dt-warm-50)",
            border: "1px dashed var(--dt-warm-200)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              letterSpacing: "0.22em",
              textTransform: "uppercase",
              color: "var(--dt-warm-500)",
              fontWeight: 400,
              marginBottom: 8,
            }}
          >
            Add document
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input name="name" placeholder="Document name" className="dt-filter-input" required />
            <button type="submit" className="dt-btn">
              Add
            </button>
          </div>
        </form>
      </div>
      <div className="dt-card" style={{ marginTop: 22 }}>
        <div className="dt-card-head">
          <div>
            <h3>Notes</h3>
            <div className="sub">Authored + timestamped · @mention to tag · newest first</div>
          </div>
        </div>
        <div style={{ padding: "18px 24px 22px" }}>
          <CandidateNotes subjectType="onboarding" subjectId={employee.id} notes={onboardingNotes} />
        </div>
      </div>

    </Shell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 9.5,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--dt-warm-500)",
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        className={mono ? "tab-num" : undefined}
        style={{
          fontSize: 13,
          color: "var(--dt-black)",
          marginTop: 4,
          fontFamily: mono ? "var(--dt-mono)" : "inherit",
        }}
      >
        {value}
      </div>
    </div>
  );
}

function DocRow({
  docId,
  employeeId,
  name,
  received,
  receivedOn,
  isLast,
}: {
  docId: string;
  employeeId: string;
  name: string;
  received: boolean;
  receivedOn: string | null;
  isLast: boolean;
}) {
  return (
    <form
      action={toggleDocument.bind(null, docId, employeeId)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 22px",
        borderBottom: isLast ? "none" : "1px solid var(--dt-warm-100)",
      }}
    >
      <button
        type="submit"
        style={{
          width: 18,
          height: 18,
          borderRadius: 4,
          background: received ? "var(--dt-success)" : "var(--dt-warm-50)",
          border: received ? "none" : "1.5px solid var(--dt-warm-300)",
          color: "white",
          fontSize: 12,
          textAlign: "center",
          lineHeight: "16px",
          flexShrink: 0,
          cursor: "pointer",
          padding: 0,
          fontFamily: "inherit",
        }}
      >
        {received ? "✓" : ""}
      </button>
      <div style={{ flex: 1, fontSize: 13 }}>
        <div style={{ fontWeight: received ? 300 : 400, color: received ? "var(--dt-warm-500)" : "var(--dt-black)" }}>
          {name}
        </div>
        {received && receivedOn && (
          <div style={{ fontSize: 10.5, color: "var(--dt-success)", marginTop: 2 }}>
            ✓ {new Date(receivedOn).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
        )}
      </div>
    </form>
  );
}
