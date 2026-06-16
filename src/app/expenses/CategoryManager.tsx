// Server component — manage the editable expense_categories lookup (CR #9).
// "Add" inserts a row; "Rename" updates the display label (slug stays stable
// so existing expenses keep their category). Categories can also be
// archived/restored without deleting history.

import { EXPENSE_CATEGORY_TONES, asBadgeTone } from "@/lib/expenses";
import { Badge } from "@/components/Badge";
import type { ExpenseCategoryRow } from "@/lib/supabase/types";
import {
  createExpenseCategory,
  setExpenseCategoryActive,
  updateExpenseCategory,
} from "./actions";

export function CategoryManager({
  categories,
}: {
  categories: ExpenseCategoryRow[];
}) {
  return (
    <div className="dt-card">
      <div className="dt-card-head">
        <div>
          <h3>Expense Categories</h3>
          <div className="sub">Add or rename the categories used above</div>
        </div>
      </div>

      <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: 10 }}>
        {categories.map((c) => (
          <form
            key={c.id}
            action={updateExpenseCategory.bind(null, c.id)}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
              opacity: c.is_active ? 1 : 0.55,
            }}
          >
            <Badge tone={asBadgeTone(c.tone)}>
              {c.slug}
            </Badge>
            <input
              name="label"
              defaultValue={c.label}
              required
              className="dt-filter-input"
              style={{ flex: "1 1 160px", minWidth: 120 }}
            />
            <select name="tone" defaultValue={c.tone} className="dt-filter-input" style={{ width: 96 }}>
              {EXPENSE_CATEGORY_TONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button type="submit" className="dt-btn" style={{ padding: "5px 10px", fontSize: 11 }}>
              Save
            </button>
            <SetActiveButton id={c.id} isActive={c.is_active} />
          </form>
        ))}
        {categories.length === 0 && (
          <div style={{ color: "var(--dt-warm-500)", fontStyle: "italic", fontSize: 12 }}>
            No categories yet — add the first one below.
          </div>
        )}
      </div>

      <div
        className="dt-card-head"
        style={{ borderTop: "1px solid var(--dt-warm-100)", marginTop: 4 }}
      >
        <div>
          <h3 style={{ fontSize: 14 }}>Add Category</h3>
        </div>
      </div>
      <form
        action={createExpenseCategory}
        style={{ padding: "14px 22px", display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}
      >
        <label className="dt-filter" style={{ flex: "1 1 180px" }}>
          <span className="dt-filter-label">Name</span>
          <input name="label" required className="dt-filter-input" placeholder="e.g. Recruiting Ads" />
        </label>
        <label className="dt-filter" style={{ width: 110 }}>
          <span className="dt-filter-label">Color</span>
          <select name="tone" defaultValue="warm" className="dt-filter-input">
            {EXPENSE_CATEGORY_TONES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="dt-btn dt-btn-primary" style={{ padding: "8px 14px" }}>
          <span>Add</span>
        </button>
      </form>
    </div>
  );
}

function SetActiveButton({ id, isActive }: { id: string; isActive: boolean }) {
  return (
    <form action={setExpenseCategoryActive.bind(null, id, !isActive)}>
      <button
        type="submit"
        className="dt-btn dt-btn-ghost"
        style={{ padding: "5px 10px", fontSize: 11 }}
      >
        {isActive ? "Archive" : "Restore"}
      </button>
    </form>
  );
}
