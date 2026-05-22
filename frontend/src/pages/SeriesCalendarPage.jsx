import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { enUS } from "date-fns/locale";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { postsApi, seriesApi } from "../api/client";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const STATUSES = ["draft", "scheduled", "published", "failed"];
const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const DragAndDropCalendar = withDragAndDrop(Calendar);

function toLocalInput(value) {
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

function createFormForDate(start) {
  return {
    mode: "create",
    title: "",
    status: "scheduled",
    scheduled_at: toLocalInput(start),
    series_role_label: "",
  };
}

function createFormForSlot(slotStart, view) {
  const start = new Date(slotStart);
  if (view === "month") start.setHours(9, 0, 0, 0);
  return createFormForDate(start);
}

function editFormForPost(post) {
  return {
    mode: "edit",
    post_id: post.id,
    title: post.title,
    status: post.status,
    scheduled_at: toLocalInput(post.scheduled_at),
    series_role_label: post.series?.role_label || "",
  };
}

function dateFromQuery(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function scheduledSeriesPosts(posts = []) {
  return posts
    .filter((post) => post.scheduled_at)
    .slice()
    .sort((first, second) => new Date(first.scheduled_at) - new Date(second.scheduled_at));
}

function postToEvent(post, kind) {
  const start = new Date(post.scheduled_at);
  return {
    id: `${kind}-${post.id}`,
    title: post.title,
    start,
    end: new Date(start.getTime() + 60 * 60 * 1000),
    resource: { kind, post },
  };
}

export default function SeriesCalendarPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get("date");
  const shouldOpenNewPost = searchParams.get("newPost") === "1";
  const [series, setSeries] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingSeries, setSavingSeries] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("month");
  const [date, setDate] = useState(new Date());
  const [seriesForm, setSeriesForm] = useState({ name: "", starts_at: "" });
  const [relatedPosts, setRelatedPosts] = useState([]);
  const [quickForm, setQuickForm] = useState(null);
  const [savingPost, setSavingPost] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    seriesApi
      .get(id)
      .then((data) => {
        if (cancelled) return;
        const queryDate = dateFromQuery(requestedDate);
        setSeries(data);
        setSeriesForm({
          name: data.name,
          starts_at: queryDate && shouldOpenNewPost ? toLocalInput(queryDate) : toLocalInput(data.starts_at),
        });
        const firstPostDate = scheduledSeriesPosts(data.posts)[0]?.scheduled_at;
        const targetDate = queryDate || new Date(firstPostDate || data.starts_at);
        setDate(targetDate);
        if (shouldOpenNewPost) {
          setQuickForm(createFormForDate(targetDate));
        } else {
          setQuickForm(null);
        }
        setRelatedPosts([]);
        setLoading(false);
        postsApi
          .list({ platform: data.platform })
          .then((posts) => {
            if (cancelled) return;
            setRelatedPosts(posts.filter((post) => (
              post.scheduled_at
              && post.platform === data.platform
              && post.series?.id !== data.id
            )));
          })
          .catch(() => {});
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Series not found");
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [id, requestedDate, shouldOpenNewPost]);

  const seriesPosts = useMemo(
    () => scheduledSeriesPosts(series?.posts),
    [series],
  );

  const events = useMemo(
    () => [
      ...(series?.posts || [])
        .filter((post) => post.scheduled_at)
        .map((post) => postToEvent(post, "series")),
      ...relatedPosts.map((post) => postToEvent(post, "context")),
    ].sort((first, second) => first.start - second.start),
    [relatedPosts, series],
  );

  const openPostForm = ({ start }) => {
    setError("");
    setQuickForm(createFormForSlot(start, view));
  };

  const saveSeries = async (event) => {
    event.preventDefault();
    setSavingSeries(true);
    setError("");
    try {
      const updated = await seriesApi.update(id, {
        name: seriesForm.name,
        starts_at: seriesForm.starts_at,
      });
      setSeries(updated);
      setSeriesForm({ name: updated.name, starts_at: toLocalInput(updated.starts_at) });
    } catch (err) {
      setError(err.message || "Series update failed");
    } finally {
      setSavingSeries(false);
    }
  };

  const savePostForm = async (event) => {
    event.preventDefault();
    setSavingPost(true);
    setError("");
    try {
      if (quickForm.mode === "edit") {
        const updated = await postsApi.update(quickForm.post_id, {
          title: quickForm.title,
          status: quickForm.status,
          scheduled_at: quickForm.scheduled_at,
          series_role_label: quickForm.series_role_label.trim() || null,
        });
        setSeries((current) => ({
          ...current,
          posts: current.posts.map((post) => (post.id === updated.id ? updated : post)),
        }));
        setDate(new Date(updated.scheduled_at));
        setQuickForm(editFormForPost(updated));
      } else {
        const created = await postsApi.create({
          title: quickForm.title,
          platform: series.platform,
          status: quickForm.status,
          scheduled_at: quickForm.scheduled_at,
          series_id: Number(id),
          series_role_label: quickForm.series_role_label.trim() || null,
        });
        setSeries((current) => ({ ...current, posts: [...current.posts, created] }));
        setDate(new Date(created.scheduled_at));
        setQuickForm(null);
      }
    } catch (err) {
      setError(err.message || "Post save failed");
    } finally {
      setSavingPost(false);
    }
  };

  const moveEvent = async ({ event, start }) => {
    if (event.resource?.kind !== "series") return;
    const post = event.resource.post;
    const previousPosts = series.posts;
    const optimisticSchedule = format(new Date(start), "yyyy-MM-dd'T'HH:mm:ss");
    setError("");
    setSeries((current) => ({
      ...current,
      posts: current.posts.map((post) => (
        post.id === event.resource.post.id ? { ...post, scheduled_at: optimisticSchedule } : post
      )),
    }));
    try {
      const updated = await postsApi.update(post.id, { scheduled_at: optimisticSchedule });
      setSeries((current) => ({
        ...current,
        posts: current.posts.map((post) => (post.id === updated.id ? updated : post)),
      }));
    } catch (err) {
      setSeries((current) => ({ ...current, posts: previousPosts }));
      setError(err.message || "Reschedule failed");
    }
  };

  const jumpToPost = (post) => {
    if (!post.scheduled_at) return;
    setDate(new Date(post.scheduled_at));
    setQuickForm(editFormForPost(post));
  };

  const selectEvent = (event) => {
    if (event.resource?.kind !== "series") return;
    setError("");
    setDate(event.start);
    setQuickForm(editFormForPost(event.resource.post));
  };

  if (loading) return <div className="loading">Loading series...</div>;
  if (!series) return <div className="error">{error || "Series not found"}</div>;

  return (
    <div className="series-editor-page">
      <div className="page-header">
        <div>
          <h1>{series.name}</h1>
          <p className="series-subtitle">
            {series.platform} series with posts staying on cadence through offsets from the series start.
          </p>
        </div>
        <Link to="/" className="btn">Back to posts</Link>
      </div>
      {error && <div className="error">{error}</div>}
      <form className="series-settings" onSubmit={saveSeries}>
        <label>
          Series name
          <input
            type="text"
            value={seriesForm.name}
            onChange={(event) => setSeriesForm((current) => ({ ...current, name: event.target.value }))}
            required
          />
        </label>
        <label>
          Series start
          <input
            type="datetime-local"
            value={seriesForm.starts_at}
            onChange={(event) => setSeriesForm((current) => ({ ...current, starts_at: event.target.value }))}
            required
          />
        </label>
        <button type="submit" className="btn primary" disabled={savingSeries}>
          {savingSeries ? "Saving..." : "Save series"}
        </button>
      </form>
      <div className="series-editor-grid">
        <div className="calendar-wrap series-calendar-wrap">
          <DragAndDropCalendar
            localizer={localizer}
            events={events}
            selectable
            resizable={false}
            views={["month", "week", "day", "agenda"]}
            view={view}
            date={date}
            onView={setView}
            onNavigate={(nextDate) => setDate(nextDate)}
            onDrillDown={(date) => openPostForm({ start: date })}
            onSelectSlot={openPostForm}
            onSelectEvent={selectEvent}
            onEventDrop={moveEvent}
            draggableAccessor={(event) => event.resource.kind === "series"}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            style={{ height: 640 }}
            eventPropGetter={(event) => {
              if (event.resource.kind === "context") {
                return {
                  className: "related-platform-event",
                  style: {
                    backgroundColor: "#e5e7eb",
                    borderColor: "#d1d5db",
                    color: "#374151",
                  },
                };
              }
              return {
                className: "series-editor-event",
                style: {
                  backgroundColor: event.resource.post.status === "published" ? "#15803d" : "#0f766e",
                },
              };
            }}
            components={{
              event: ({ event }) => (
                <div className="series-event-content">
                  <span>{event.title}</span>
                  {event.resource.kind === "context" ? (
                    <em>same-platform post</em>
                  ) : (
                    event.resource.post.series?.role_label && <em>{event.resource.post.series.role_label}</em>
                  )}
                </div>
              ),
            }}
          />
        </div>
        <aside className="series-quick-panel">
          <div className="series-quick-section">
            {quickForm ? (
              <form className="series-quick-form" onSubmit={savePostForm}>
                <h2>{quickForm.mode === "edit" ? "Edit post" : "Add post"}</h2>
                <label>
                  Title
                  <input
                    type="text"
                    value={quickForm.title}
                    onChange={(event) => setQuickForm((current) => ({ ...current, title: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Scheduled at
                  <input
                    type="datetime-local"
                    value={quickForm.scheduled_at}
                    onChange={(event) => setQuickForm((current) => ({ ...current, scheduled_at: event.target.value }))}
                    required
                  />
                </label>
                <label>
                  Status
                  <select
                    value={quickForm.status}
                    onChange={(event) => setQuickForm((current) => ({ ...current, status: event.target.value }))}
                  >
                    {STATUSES.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Series role label
                  <input
                    type="text"
                    value={quickForm.series_role_label}
                    onChange={(event) => setQuickForm((current) => ({ ...current, series_role_label: event.target.value }))}
                    placeholder="Announcement"
                  />
                </label>
                <div className="form-actions">
                  <button type="submit" className="btn primary" disabled={savingPost}>
                    {savingPost
                      ? "Saving..."
                      : quickForm.mode === "edit" ? "Save post" : "Add post"}
                  </button>
                  <button type="button" className="btn" onClick={() => setQuickForm(null)}>
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <div className="series-quick-empty">
                <h2>Add to this series</h2>
                <p>Select a day or time slot on the calendar to schedule a series post.</p>
              </div>
            )}
          </div>
          <div className="series-post-list">
            <h2>Series posts</h2>
            {seriesPosts.length === 0 ? (
              <p>No series posts yet.</p>
            ) : (
              <div className="series-post-list-items">
                {seriesPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    className="series-post-jump"
                    onClick={() => jumpToPost(post)}
                  >
                    <span>{post.title}</span>
                    <em>
                      {post.series?.role_label ? `${post.series.role_label} - ` : ""}
                      {format(new Date(post.scheduled_at), "MMM d, yyyy HH:mm")}
                    </em>
                  </button>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
