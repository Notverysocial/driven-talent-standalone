import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { WaitingAge } from "@/components/WaitingAge";
import {
  CANDIDATE_STATUSES,
  scoreColor,
  tierLabel,
  weightedScore,
} from "@/lib/candidates";
import { getCandidate } from "@/lib/candidates.server";
import { CalendlyScheduler } from "@/components/CalendlyScheduler";
import { getCalendlySchedulingContext } from "@/lib/integrations/calendly-scheduling.server";
import {
  buildCalendlyBookingUrl,
  CALENDLY_EVENT_TYPES,
} from "@/lib/integrations/calendly-events";
import { CriterionRow } from "./CriterionRow";
import { StatusActions } from "./StatusActions";
import { ScreeningStatusActions } from "./ScreeningStatusActions";
import { DoNotReturnActions } from "./DoNotReturnActions";
import { ResumeBlock } from "./ResumeBlock";
import { SendOnboardingDoc } from "./SendOnboardingDoc";
import { LanguagePrefSelect } from "@/components/LanguagePrefSelect";
import { setCandidateLanguagePref } from "../actions";
import { PipelineTracker } from "./PipelineTracker";
import { CandidateProfileFields } from "./CandidateProfileFields";
import { CandidateNotes } from "@/components/CandidateNotes";
import { listNotes } from "@/lib/candidate-notes.server";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { listActivity } from "@/lib/activity-log.server";
import { Tabs } from "@/components/Tabs";
import { CandidatePhotos } from "./CandidatePhotos";
import { CandidateSchedule } from "./CandidateSchedule";
import { CandidateInterview } from "./CandidateInterview";
import { listCandidatePhotos } from "@/lib/candidate-photos.server";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cand = await getCandidate(id);
  if (!cand) notFound();
  const [notes, activity, photos] = await Promise.all([
    listNotes("candidate", cand.id),
    listActivity("candidate", cand.id),
    listCandidatePhotos(cand.id, cand.photo_url),
  ]);

  const score = cand.score ?? weightedScore(cand.criteria);
  const tier = tierLabel(score);
  const tierColor = scoreColor(score);
  const status = CANDIDATE_STATUSES.find((s) => s.id === cand.status)!;

  // Calendly scheduling — surface Phone Screen + Interview while the candidate
  // is still moving through the pipeline (no point once hired/rejected/offer).
  const cal = await getCalendlySchedulingContext();
  const schedulingActive = ["applied", "screening", "interview"].includes(
    cand.status,
  );
  const calOptions = cal.schedulingUrl
    ? [
        {
          key: "phone_screen",
          label: "Phone Screen",
          durationMinutes: CALENDLY_EVENT_TYPES.phone_screen.durationMinutes,
          url: buildCalendlyBookingUrl({
            schedulingUrl: cal.schedulingUrl,
            slug: cal.eventSlugs.phone_screen,
            name: cand.full_name,
            email: cand.email,
          }),
        },
        {
          key: "interview",
          label: "Interview",
          durationMinutes: CALENDLY_EVENT_TYPES.interview.durationMinutes,
          url: buildCalendlyBookingUrl({
            schedulingUrl: cal.schedulingUrl,
            slug: cal.eventSlugs.interview,
            name: cand.full_name,
            email: cand.email,
          }),
        },
      ]
    : [];

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / CANDIDATE"
        scriptWord="Score "
        title="Candidate"
        actions={
          <>
            <Link href="/candidates" className="dt-btn">
              ← All Candidates
            </Link>
            <ScreeningStatusActions
              candidateId={cand.id}
              current={cand.screening_status}
            />
            <DoNotReturnActions
              candidateId={cand.id}
              isDnr={cand.lifecycle_status === "do_not_return"}
            />
            <StatusActions candidateId={cand.id} currentStatus={cand.status} />
          </>
        }
      />

      {(() => {
        const isDnr = cand.lifecycle_status === "do_not_return";
        if (!isDnr && !cand.red_flag && !cand.do_not_send) return null;
        // Do Not Return is the strongest flag and wins the banner label + reason.
        const label = isDnr
          ? "Do Not Return"
          : cand.do_not_send
            ? "Do Not Send"
            : "Red Flag";
        const reason = isDnr
          ? cand.do_not_return_reason
          : cand.red_flag_reason;
        return (
          <div
            role="alert"
            style={{
              marginBottom: 16,
              padding: "12px 16px",
              borderRadius: 6,
              background: "rgba(178,58,58,0.08)",
              border: "1px solid rgba(178,58,58,0.35)",
              color: "var(--dt-danger)",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <strong style={{ letterSpacing: "0.04em", textTransform: "uppercase", fontSize: 11 }}>
              {label}
            </strong>
            <span>{reason ?? "Flagged by a recruiter."}</span>
          </div>
        );
      })()}
      <div
        className="candidate-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) 360px",
          gap: 22,
        }}
      >
        <div className="col gap-md">
          <div
            className="dt-card gold-edge"
            style={{
              padding: "22px 26px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              flexWrap: "wrap",
            }}
          >
            <div className="dt-person">
              <Avatar name={cand.full_name} size="lg" />
              <div>
                <div
                  style={{
                    fontFamily: "var(--dt-display)",
                    fontSize: 22,
                    fontWeight: 300,
                  }}
                >
                  {cand.full_name}
                </div>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--dt-warm-500)",
                    marginTop: 3,
                  }}
                >
                  {cand.applied_for ?? "—"}
                  {cand.experience_years ? ` · ${cand.experience_years} yrs` : ""}
                  {cand.city ? ` · ${cand.city}` : ""}
                </div>
                {/* Carry the waiting-age signal onto the candidate record (card
                    cf34006d): while a promoted candidate is still moving through
                    the funnel, how long they have waited since applying still
                    matters. Hidden once hired or rejected. */}
                {cand.status !== "hired" && cand.status !== "rejected" && (
                  <div style={{ marginTop: 8 }}>
                    <WaitingAge
                      since={cand.applied_at ?? cand.created_at}
                      verb="in pipeline"
                    />
                  </div>
                )}
                {cand.certifications.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      marginTop: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    {cand.certifications.map((c) => (
                      <Badge key={c} tone="warm">
                        {c}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div
                className="tiny muted"
                style={{
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 400,
                }}
              >
                Source
              </div>
              <div
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 15,
                  fontWeight: 300,
                  marginTop: 2,
                }}
              >
                {cand.source ?? "—"}
              </div>
              <div className="tiny muted" style={{ marginTop: 2 }}>
                {cand.applied_at
                  ? new Date(cand.applied_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : "—"}
              </div>
              {cand.recruiter && (
                <div className="tiny muted" style={{ marginTop: 4 }}>
                  Recruiter: <span style={{ color: "var(--dt-warm-700)" }}>{cand.recruiter}</span>
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Badge tone={status.tone}>{status.label}</Badge>
              </div>
            </div>
          </div>

          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Profile</h3>
                <div className="sub">Personal info, job fit, assignment &amp; flags</div>
              </div>
            </div>
            <div style={{ padding: "18px 24px 22px" }}>
              <CandidateProfileFields cand={cand} />
            </div>
          </div>

          <div className="dt-card gold-edge">
            <div className="dt-card-head">
              <div>
                <h3>Recruitment Pipeline</h3>
                <div className="sub">Five stages · replaces the parallel spreadsheet</div>
              </div>
            </div>
            <div style={{ padding: "18px 24px 22px" }}>
              <PipelineTracker cand={cand} />
            </div>
          </div>

          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Evaluation Criteria</h3>
                <div className="sub">
                  Drag the sliders. Weighted average updates on release.
                </div>
              </div>
              <Badge tone="dark">
                {cand.criteria.length} criteria · weighted
              </Badge>
            </div>
            <div style={{ padding: "8px 24px 24px" }}>
              {cand.criteria.length === 0 ? (
                <div
                  style={{
                    padding: "32px 0",
                    color: "var(--dt-warm-500)",
                    fontStyle: "italic",
                    textAlign: "center",
                  }}
                >
                  No criteria configured. (This shouldn&apos;t happen — new candidates seed defaults.)
                </div>
              ) : (
                cand.criteria.map((c, i) => (
                  <CriterionRow
                    key={c.key}
                    candidateId={cand.id}
                    criterion={c}
                    isLast={i === cand.criteria.length - 1}
                  />
                ))
              )}
            </div>
          </div>

          {/* Unified candidate workspace (card 0631ab59) — notes, schedule,
              photos, and the change log in ONE tabbed interface so nothing is
              scattered and processing is faster. */}
          <div className="dt-card gold-edge">
            <div className="dt-card-head">
              <div>
                <h3>Candidate Workspace</h3>
                <div className="sub">Notes, schedule, photos, and history in one place</div>
              </div>
            </div>
            <Tabs
              ariaLabel="Candidate workspace sections"
              tabs={[
                { key: "notes", label: "Notes", badge: notes.length || undefined },
                { key: "interview", label: "Interview" },
                { key: "schedule", label: "Schedule" },
                { key: "photos", label: "Photos", badge: photos.length || undefined },
                { key: "log", label: "Change Log", badge: activity.length || undefined },
              ]}
              panels={{
                notes: (
                  <>
                    {cand.notes && cand.notes.trim() !== "" && (
                      <div
                        style={{
                          marginBottom: 16,
                          padding: "10px 12px",
                          background: "var(--dt-warm-50)",
                          border: "1px solid var(--dt-warm-150)",
                          fontSize: 12.5,
                          color: "var(--dt-warm-600, #555)",
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        <div
                          className="tiny muted"
                          style={{ letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}
                        >
                          Legacy note
                        </div>
                        {cand.notes}
                      </div>
                    )}
                    <CandidateNotes subjectType="candidate" subjectId={cand.id} notes={notes} />
                  </>
                ),
                schedule: (
                  <CandidateSchedule cand={cand}>
                    {schedulingActive ? (
                      <CalendlyScheduler
                        connected={cal.connected}
                        options={calOptions}
                        size="sm"
                        emptyHint="Connect Calendly in Integrations to schedule."
                      />
                    ) : null}
                  </CandidateSchedule>
                ),
                photos: <CandidatePhotos candidateId={cand.id} photos={photos} />,
                log: <ActivityTimeline entries={activity} />,
                interview: <CandidateInterview cand={cand} />,
              }}
            />
          </div>
        </div>

        <div className="col gap-md">
          <div
            className="dt-card gold-edge"
            style={{
              padding: "32px 26px",
              textAlign: "center",
              background: "#FFFFFF",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "radial-gradient(ellipse at top, rgba(245,166,35,0.08), transparent 70%)",
              }}
            />
            <div style={{ position: "relative" }}>
              <div
                className="tiny muted"
                style={{
                  letterSpacing: "0.22em",
                  textTransform: "uppercase",
                  fontWeight: 400,
                }}
              >
                Weighted Score
              </div>
              <div
                className="tab-num"
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 64,
                  fontWeight: 200,
                  marginTop: 8,
                  color: tierColor,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {score.toFixed(1)}
              </div>
              <div
                style={{
                  fontFamily: "var(--dt-display)",
                  fontSize: 18,
                  fontWeight: 300,
                  marginTop: 12,
                  color: tierColor,
                  letterSpacing: "0.04em",
                }}
              >
                {tier}
              </div>
            </div>
          </div>

          <ResumeBlock candidateId={cand.id} resumePath={cand.resume_path} />

          <div className="dt-card" style={{ padding: 18 }}>
            <div
              className="tiny muted"
              style={{
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                fontWeight: 400,
              }}
            >
              Contact
            </div>
            <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
              <div>{cand.email ?? "—"}</div>
              <div className="tab-num">{cand.phone ?? "—"}</div>
            </div>
            {/* Document-language preference — carries onto the employee record
                at hire so onboarding docs default to their language (task 86e20w8yz). */}
            <div style={{ marginTop: 14 }}>
              <LanguagePrefSelect
                current={cand.language_pref}
                action={setCandidateLanguagePref.bind(null, cand.id)}
              />
            </div>
          </div>

          {cand.status === "offer" && (
            <div className="dt-card" style={{ padding: 18 }}>
              <div
                className="tiny muted"
                style={{
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  fontWeight: 400,
                  marginBottom: 10,
                }}
              >
                Onboarding Offer
              </div>
              <SendOnboardingDoc
                candidateId={cand.id}
                hasEmail={Boolean(cand.email)}
                alreadySentDocId={cand.pandadoc_document_id}
              />
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
