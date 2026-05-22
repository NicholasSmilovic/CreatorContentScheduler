import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { postsApi, seriesApi } from "../api/client";

const PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"];
const STATUSES = ["draft", "scheduled", "published", "failed"];

export default function PostEdit() {
  const { id } = useParams();
  // When creating a new post the route is `/posts/new`, which does not
  // provide an `id` param. Treat both an absent `id` and the literal
  // string "new" as the "new post" case so we don't call the detail
  // endpoint with an invalid path parameter.
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [seriesOptions, setSeriesOptions] = useState([]);
  const [form, setForm] = useState({
    title: "",
    platform: "youtube",
    scheduled_at: "",
    status: "draft",
    series_id: "",
    series_role_label: "",
  });

  useEffect(() => {
    seriesApi.list().then(setSeriesOptions).catch(() => {});
  }, []);

  const selectedSeries = useMemo(
    () => seriesOptions.find((series) => String(series.id) === form.series_id),
    [form.series_id, seriesOptions],
  );

  useEffect(() => {
    if (isNew) return;
    postsApi
      .get(id)
      .then((p) => {
        setForm({
          title: p.title,
          platform: p.platform,
          scheduled_at: p.scheduled_at
            ? format(new Date(p.scheduled_at), "yyyy-MM-dd'T'HH:mm")
            : "",
          status: p.status,
          series_id: p.series ? String(p.series.id) : "",
          series_role_label: p.series?.role_label || "",
        });
      })
      .catch(() => setError("Post not found"))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.series_id && !form.scheduled_at) {
      setError("Series posts need a scheduled time.");
      return;
    }
    if (selectedSeries && form.platform !== selectedSeries.platform) {
      setError("Series posts must use the series platform.");
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title,
      platform: form.platform,
      status: form.status,
      scheduled_at: form.scheduled_at || null,
      series_id: form.series_id ? Number(form.series_id) : null,
      series_role_label: form.series_id ? form.series_role_label.trim() || null : null,
    };
    try {
      if (isNew) {
        const created = await postsApi.create(payload);
        navigate(`/posts/${created.id}/edit`, { replace: true });
      } else {
        await postsApi.update(id, payload);
        navigate("/");
      }
    } catch (err) {
      setError(err.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loading">Loading…</div>;

  return (
    <div className="post-edit-page">
      <div className="page-header">
        <h1>{isNew ? "New post" : "Edit post"}</h1>
        <Link to="/" className="btn">Back to list</Link>
      </div>
      <form onSubmit={handleSubmit} className="post-form">
        {error && <div className="error">{error}</div>}
        <label>
          Title
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            required
            placeholder="Post title"
          />
        </label>
        <label>
          Platform
          <select
            aria-describedby={form.series_id ? "platform-lock-hint" : undefined}
            aria-label="Platform"
            value={form.platform}
            onChange={(e) => setForm((f) => ({ ...f, platform: e.target.value }))}
            disabled={Boolean(form.series_id)}
          >
            {PLATFORMS.map((pl) => (
              <option key={pl} value={pl}>{pl}</option>
            ))}
          </select>
          {form.series_id && (
            <span id="platform-lock-hint" className="field-hint">
              Locked to {selectedSeries?.platform || form.platform} by the selected series.
            </span>
          )}
        </label>
        <label>
          Scheduled at (optional)
          <input
            type="datetime-local"
            value={form.scheduled_at}
            onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
          />
        </label>
        <label>
          Status
          <select
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          Content series
          <select
            value={form.series_id}
            onChange={(e) => {
              const nextId = e.target.value;
              const nextSeries = seriesOptions.find((series) => String(series.id) === nextId);
              setForm((f) => ({
                ...f,
                series_id: nextId,
                platform: nextSeries ? nextSeries.platform : f.platform,
                series_role_label: nextId ? f.series_role_label : "",
              }));
            }}
          >
            <option value="">No series</option>
            {seriesOptions.map((series) => (
              <option key={series.id} value={series.id}>
                {series.name} ({series.platform})
              </option>
            ))}
          </select>
        </label>
        <label>
          Series role label (optional)
          <input
            type="text"
            value={form.series_role_label}
            disabled={!form.series_id}
            onChange={(e) => setForm((f) => ({ ...f, series_role_label: e.target.value }))}
            placeholder="Teaser, reminder, follow-up"
          />
        </label>
        <div className="form-actions">
          <button type="submit" disabled={saving} className="btn primary">
            {saving ? "Saving…" : isNew ? "Create" : "Save"}
          </button>
          {!isNew && (
            <Link to="/" className="btn">Cancel</Link>
          )}
        </div>
      </form>
    </div>
  );
}
