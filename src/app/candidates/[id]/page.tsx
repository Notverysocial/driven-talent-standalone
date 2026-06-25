import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import {
  CANDIDATE_STATUSES,
  scoreColor,
  tierLabel,
  weightedScore,
} from "@/lib/candidates";
import { getCandidate } from "@/lib/candidates.server";
import { CriterionRow } from "./CriterionRow";
import { NotesEditor } from "./NotesEditor";
import { StatusActions } from "./StatusActions";
import { ResumeBlock } from "./ResumeBlock";
import { SendOnboardingDoc } from "./SendOnboardingDoc";
import { LanguagePrefSelect } from "@/components/LanguagePrefSelect";
import { setCandidateLanguagePref } from "../actions";

export default async function CandidateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const cand = await getCandidate(id);
  if (!cand) notFound();

  const score = cand.score ?? weightedScore(cand.criteria);
  const tier = tierLabel(score);
  const tierColor = scoreColor(score);
  const status = CANDIDATE_STATUSES.find((s) => s.id === cand.status)!;

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
            <StatusActions candidateId={cand.id} currentStatus={cand.status} />
          </>
        }
      />

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

          <div className="dt-card">
            <div className="dt-card-head">
              <div>
                <h3>Roxanna&apos;s Notes</h3>
                <div className="sub">What you&apos;d tell a client about this person</div>
              </div>
            </div>
            <div style={{ padding: "18px 24px 22px" }}>
              <NotesEditor candidateId={cand.id} initialNotes={cand.notes ?? ""} />
            </div>
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
