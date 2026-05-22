import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { postsApi, seriesApi } from "../api/client";

const PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"];
const STATUSES = ["draft", "scheduled", "published", "failed"];
const MIN_PLATFORM_SPACING_MINUTES = 15;
const MIN_PLATFORM_SPACING_MS = MIN_PLATFORM_SPACING_MINUTES * 60 * 1000;
const DAY_MINUTES = 24 * 60;
const PLATFORM_SPACING_ERROR = `Posts on the same platform must be at least ${MIN_PLATFORM_SPACING_MINUTES} minutes apart.`;

function parseScheduledDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function localDayStart(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function minutesFromDayStart(date, dayStart) {
  return clamp((date.getTime() - dayStart.getTime()) / 60000, 0, DAY_MINUTES);
}

function isCurrentPost(post, id) {
  return id && String(post.id) === String(id);
}

function scheduledPostDate(post) {
  const date = post.scheduled_at ? new Date(post.scheduled_at) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function PlatformDayAvailability({
  platform,
  scheduledDate,
  loading,
  error,
  ranges,
  candidatePercent,
  hasConflict,
}) {
  return (
    <section className="availability-panel" aria-live="polite">
      <div className="availability-header">
        <div>
          <strong>Platform availability</strong>
          <span>
            {scheduledDate
              ? `${platform} on ${format(scheduledDate, "MMM d, yyyy")}`
              : platform}
          </span>
        </div>
        {scheduledDate && (
          <span className={`availability-status ${hasConflict ? "conflict" : "available"}`}>
            {hasConflict ? "Conflict" : "Available"}
          </span>
        )}
      </div>

      {!scheduledDate ? (
        <p className="availability-empty">Choose a scheduled time to see that platform's day.</p>
      ) : (
        <>
          <div className="availability-timeline" aria-label={`${platform} availability`}>
            <div className="availability-scale" aria-hidden="true">
              <span>00:00</span>
              <span>06:00</span>
              <span>12:00</span>
              <span>18:00</span>
              <span>24:00</span>
            </div>
            <div className="availability-rail">
              {[25, 50, 75].map((left) => (
                <span
                  key={left}
                  className="availability-tick"
                  style={{ left: `${left}%` }}
                />
              ))}
              {ranges.map((range) => (
                <span
                  key={`${range.post.id}-${range.blockedStart.getTime()}`}
                  className="availability-block"
                  style={{ left: `${range.leftPercent}%`, width: `${range.widthPercent}%` }}
                  aria-label={`${range.post.title} blocks ${range.blockedLabel}`}
                  title={`${range.post.title}: ${range.blockedLabel}`}
                />
              ))}
              {candidatePercent !== null && (
                <span
                  className={`availability-candidate ${hasConflict ? "conflict" : ""}`}
                  style={{ left: `${candidatePercent}%` }}
                  aria-label={`Selected time ${format(scheduledDate, "HH:mm")}`}
                  title={`Selected time ${format(scheduledDate, "HH:mm")}`}
                />
              )}
            </div>
          </div>

          {loading && <p className="availability-empty">Loading platform schedule...</p>}
          {error && <p className="field-error-text">{error}</p>}
          {!loading && !error && ranges.length === 0 && (
            <p className="availability-empty">No scheduled {platform} posts block this day.</p>
          )}
          {!loading && !error && ranges.length > 0 && (
            <ul className="availability-list">
              {ranges.map((range) => (
                <li key={`list-${range.post.id}-${range.blockedStart.getTime()}`}>
                  <span>{format(range.scheduledDate, "HH:mm")}</span>
                  <strong>{range.post.title}</strong>
                  <em>{range.blockedLabel}</em>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

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
  const [platformPosts, setPlatformPosts] = useState([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityError, setAvailabilityError] = useState("");
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

  useEffect(() => {
    if (loading || !form.platform) return undefined;
    let cancelled = false;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    postsApi
      .list({ platform: form.platform })
      .then((posts) => {
        if (cancelled) return;
        setPlatformPosts(Array.isArray(posts) ? posts : []);
      })
      .catch(() => {
        if (cancelled) return;
        setPlatformPosts([]);
        setAvailabilityError("Could not load platform schedule.");
      })
      .finally(() => {
        if (!cancelled) setAvailabilityLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [form.platform, loading]);

  const scheduledDate = useMemo(
    () => parseScheduledDate(form.scheduled_at),
    [form.scheduled_at],
  );

  const platformScheduledPosts = useMemo(
    () => platformPosts
      .filter((post) => post.scheduled_at && !isCurrentPost(post, id))
      .map((post) => ({ post, scheduledDate: scheduledPostDate(post) }))
      .filter((entry) => entry.scheduledDate),
    [id, platformPosts],
  );

  const spacingConflict = useMemo(() => {
    if (!scheduledDate) return null;
    return platformScheduledPosts.find(({ scheduledDate: postDate }) => (
      Math.abs(postDate.getTime() - scheduledDate.getTime()) < MIN_PLATFORM_SPACING_MS
    ))?.post || null;
  }, [platformScheduledPosts, scheduledDate]);

  const availabilityRanges = useMemo(() => {
    if (!scheduledDate) return [];
    const dayStart = localDayStart(scheduledDate);
    const dayEnd = new Date(dayStart.getTime() + DAY_MINUTES * 60000);

    return platformScheduledPosts
      .map(({ post, scheduledDate: postDate }) => {
        const blockedStart = new Date(postDate.getTime() - MIN_PLATFORM_SPACING_MS);
        const blockedEnd = new Date(postDate.getTime() + MIN_PLATFORM_SPACING_MS);
        if (blockedEnd <= dayStart || blockedStart >= dayEnd) return null;
        const startMinutes = minutesFromDayStart(blockedStart, dayStart);
        const endMinutes = minutesFromDayStart(blockedEnd, dayStart);
        return {
          post,
          scheduledDate: postDate,
          blockedStart,
          blockedEnd,
          blockedLabel: `${format(blockedStart, "HH:mm")}-${format(blockedEnd, "HH:mm")}`,
          leftPercent: (startMinutes / DAY_MINUTES) * 100,
          widthPercent: Math.max(((endMinutes - startMinutes) / DAY_MINUTES) * 100, 0.25),
        };
      })
      .filter(Boolean)
      .sort((first, second) => first.scheduledDate - second.scheduledDate);
  }, [platformScheduledPosts, scheduledDate]);

  const candidatePercent = useMemo(() => {
    if (!scheduledDate) return null;
    const dayStart = localDayStart(scheduledDate);
    return (minutesFromDayStart(scheduledDate, dayStart) / DAY_MINUTES) * 100;
  }, [scheduledDate]);

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
    if (spacingConflict) {
      setError(PLATFORM_SPACING_ERROR);
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
            aria-invalid={Boolean(spacingConflict)}
            aria-describedby={spacingConflict ? "scheduled-spacing-conflict" : undefined}
            onChange={(e) => setForm((f) => ({ ...f, scheduled_at: e.target.value }))}
          />
          {spacingConflict && (
            <span id="scheduled-spacing-conflict" className="field-error-text">
              {PLATFORM_SPACING_ERROR} Closest: {spacingConflict.title} at{" "}
              {format(new Date(spacingConflict.scheduled_at), "HH:mm")}.
            </span>
          )}
        </label>
        <PlatformDayAvailability
          platform={form.platform}
          scheduledDate={scheduledDate}
          loading={availabilityLoading}
          error={availabilityError}
          ranges={availabilityRanges}
          candidatePercent={candidatePercent}
          hasConflict={Boolean(spacingConflict)}
        />
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
