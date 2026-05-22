import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { seriesApi } from "../api/client";

const PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"];

export default function NewSeries() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    platform: "",
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
      });
      navigate(`/series/${series.id}`);
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
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Creating..." : "Create series"}
          </button>
        </div>
      </form>
    </div>
  );
}
