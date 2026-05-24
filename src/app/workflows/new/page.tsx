import Link from "next/link";
import { Shell } from "@/components/Shell";
import { Topbar } from "@/components/Topbar";
import { templateById } from "@/lib/workflows";
import { createWorkflow } from "../actions";
import { WorkflowBuilder } from "../WorkflowBuilder";

export default async function NewWorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>;
}) {
  const sp = await searchParams;
  const tpl = templateById(sp.template ?? null);

  return (
    <Shell>
      <Topbar
        crumb="WORKSPACE / AUTOMATION / WORKFLOWS / NEW"
        scriptWord="New "
        title="Workflow"
        actions={
          <Link href="/workflows" className="dt-btn">
            <span>← Back</span>
          </Link>
        }
      />

      {tpl && (
        <div
          style={{
            fontSize: 11.5,
            color: "var(--dt-warm-700)",
            background: "var(--dt-warm-50)",
            border: "1px solid var(--dt-warm-150)",
            borderLeft: "3px solid var(--dt-gold)",
            padding: "10px 14px",
            marginBottom: 18,
            lineHeight: 1.5,
          }}
        >
          Starting from template <strong>{tpl.name}</strong> — feel free to rename it or tweak any
          step before saving.
        </div>
      )}

      <WorkflowBuilder
        action={createWorkflow}
        submitLabel="Save Workflow"
        mode="create"
        initial={
          tpl
            ? {
                name: tpl.name,
                description: tpl.description,
                enabled: true,
                definition: tpl.definition,
                templateId: tpl.id,
              }
            : undefined
        }
      />
    </Shell>
  );
}
