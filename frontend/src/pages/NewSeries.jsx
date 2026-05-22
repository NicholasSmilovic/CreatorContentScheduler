import { useState } from "react";
import { format } from "date-fns";
import { Link, useNavigate } from "react-router-dom";
import { seriesApi } from "../api/client";

const PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"];

function defaultStartTime() {
  const nextHour = new Date();
  nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
  return format(nextHour, "yyyy-MM-dd'T'HH:mm");
}

export default function NewSeries() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    platform: "",
    starts_at: defaultStartTime(),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = "Enter a series name.";
    if (!form.platform) nextErrors.platform = "Choose a platform for this series.";
    if (!form.starts_at) nextErrors.starts_at = "Choose a series start time.";
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) {
      setError("Fill out the highlighted fields.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const series = await seriesApi.create({
        name: form.name.trim(),
        platform: form.platform,
        starts_at: form.starts_at,
      });
      const startParam = encodeURIComponent(form.starts_at);
      navigate(`/series/${series.id}?date=${startParam}&newPost=1`);
    } catch (err) {
      setError(err.message || "Series creation failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="series-create-page">
      <div className="page-header">
        <h1>New series</h1>
        <Link to="/" className="btn">Back to posts</Link>
      </div>
      <form className="series-form" onSubmit={handleSubmit} noValidate>
        {error && <div className="error">{error}</div>}
        <label>
          Series name
          <input
            aria-label="Series name"
            type="text"
            value={form.name}
            onChange={(event) => updateField("name", event.target.value)}
            placeholder="Product launch"
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "series-name-error" : undefined}
            required
          />
          {fieldErrors.name && (
            <span id="series-name-error" className="field-error-text">{fieldErrors.name}</span>
          )}
        </label>
        <label>
          Platform
          <select
            aria-label="Platform"
            value={form.platform}
            onChange={(event) => updateField("platform", event.target.value)}
            aria-invalid={Boolean(fieldErrors.platform)}
            aria-describedby={fieldErrors.platform ? "series-platform-error" : undefined}
            required
          >
            <option value="">Select a platform</option>
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>
          {fieldErrors.platform && (
            <span id="series-platform-error" className="field-error-text">{fieldErrors.platform}</span>
          )}
        </label>
        <label>
          Series start
          <input
            aria-label="Series start"
            type="datetime-local"
            value={form.starts_at}
            onChange={(event) => updateField("starts_at", event.target.value)}
            aria-invalid={Boolean(fieldErrors.starts_at)}
            aria-describedby={fieldErrors.starts_at ? "series-start-error" : undefined}
            required
          />
          {fieldErrors.starts_at && (
            <span id="series-start-error" className="field-error-text">{fieldErrors.starts_at}</span>
          )}
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Creating..." : "Create series"}
          </button>
        </div>
      </form>
    </div>
  );
}
