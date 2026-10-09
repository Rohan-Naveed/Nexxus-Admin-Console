import { useState } from "react";
import { Archive, Check, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";

export default function PropertiesTab({
  type,
  categories,
  onCreate,
  onUpdate,
  onArchive,
  onDelete,
}) {
  const [label, setLabel] = useState("");
  const [editingKey, setEditingKey] = useState(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const title = type === "expense" ? "Expense categories" : "Deduction categories";
  const noun = type === "expense" ? "expense" : "deduction";

  async function submitCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onCreate({ label });
      setLabel("");
    } catch (err) {
      setError(err.message || `Could not add this ${noun} category.`);
    } finally {
      setSaving(false);
    }
  }

  async function submitEdit(key) {
    setSaving(true);
    setError("");
    try {
      await onUpdate(key, { label: editingLabel });
      setEditingKey(null);
    } catch (err) {
      setError(err.message || `Could not update this ${noun} category.`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(category) {
    setSaving(true);
    setError("");
    try {
      if (category.active) await onArchive(category.key);
      else await onUpdate(category.key, { active: true });
    } catch (err) {
      setError(err.message || `Could not update this ${noun} category.`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-stack">
      <div className="panel">
        <div className="section-head">
          <div>
            <div className="panel-title">{title}</div>
            <div className="panel-sub">
              Add, rename, or archive categories. Archived categories remain in
              past records and can be restored. Categories without linked
              records can be permanently deleted.
            </div>
          </div>
        </div>

        <form className="form-row" onSubmit={submitCreate}>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label" htmlFor={`${type}-category-name`}>
              New category name
            </label>
            <input
              id={`${type}-category-name`}
              className="form-input"
              value={label}
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={type === "expense" ? "e.g. Tea" : "e.g. Equipment"}
              required
            />
          </div>
          <button
            className="primary-btn category-add-btn"
            type="submit"
            disabled={saving}
          >
            <Plus size={15} strokeWidth={2.25} />
            Add category
          </button>
        </form>

        {error && <div className="form-error">{error}</div>}

        {categories.length === 0 ? (
          <div className="empty-row">No categories have been added yet.</div>
        ) : (
          <div className="stack-list category-list">
            {categories.map((category) => (
              <div
                className="list-card list-card-compact"
                key={category.key}
                style={{ opacity: category.active ? 1 : 0.65 }}
              >
                {editingKey === category.key ? (
                  <>
                    <input
                      className="form-input"
                      value={editingLabel}
                      maxLength={80}
                      onChange={(event) => setEditingLabel(event.target.value)}
                      aria-label={`Rename ${category.label}`}
                    />
                    <div className="entry-row-main">
                      <button
                        className="icon-btn"
                        type="button"
                        disabled={saving}
                        onClick={() => submitEdit(category.key)}
                        aria-label="Save category name"
                      >
                        <Check size={15} />
                      </button>
                      <button
                        className="icon-btn"
                        type="button"
                        onClick={() => setEditingKey(null)}
                        aria-label="Cancel category edit"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <div className="list-card-title">{category.label}</div>
                      <div className="panel-sub">
                        {category.active ? "Active" : "Archived"} ·{" "}
                        {category.usageCount ?? 0}{" "}
                        {type === "deduction"
                          ? "deduction history entr"
                          : "expense entr"}
                        {(category.usageCount ?? 0) === 1 ? "y" : "ies"}
                      </div>
                    </div>
                    <div className="entry-row-main">
                      <button
                        className="icon-btn"
                        type="button"
                        disabled={saving}
                        onClick={() => {
                          setEditingKey(category.key);
                          setEditingLabel(category.label);
                        }}
                        aria-label={`Edit ${category.label}`}
                        title="Edit"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        type="button"
                        disabled={saving}
                        onClick={() => toggleActive(category)}
                        aria-label={`${category.active ? "Archive" : "Restore"} ${category.label}`}
                        title={category.active ? "Archive" : "Restore"}
                      >
                        {category.active ? (
                          <Archive size={14} />
                        ) : (
                          <RotateCcw size={14} />
                        )}
                      </button>
                      {category.usageCount === 0 && (
                        <button
                          className="icon-btn"
                          type="button"
                          disabled={saving}
                          onClick={async () => {
                            if (!window.confirm(`Permanently delete "${category.label}"? This cannot be undone.`)) return;
                            setSaving(true);
                            setError("");
                            try {
                              await onDelete(category.key);
                            } catch (err) {
                              setError(err.message || `Could not delete this ${noun} category.`);
                            } finally {
                              setSaving(false);
                            }
                          }}
                          aria-label={`Delete ${category.label}`}
                          title="Permanently delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
