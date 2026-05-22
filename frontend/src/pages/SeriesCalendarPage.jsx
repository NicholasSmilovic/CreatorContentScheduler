import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import withDragAndDrop from "react-big-calendar/lib/addons/dragAndDrop";
import { enUS } from "date-fns/locale";
import { format, getDay, parse, startOfWeek } from "date-fns";
import { postsApi, seriesApi } from "../api/client";
import {
  buildSelectionRange,
  calendarDaySelectionProps,
  calendarSlotSelectionProps,
  eventSelectionRange,
  postBufferEvents,
  postEventEnd,
} from "../utils/calendarSelection";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "react-big-calendar/lib/addons/dragAndDrop/styles.css";

const STATUSES = ["draft", "scheduled", "published", "failed"];
const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({ format, parse, startOfWeek, getDay, locales });
const DragAndDropCalendar = withDragAndDrop(Calendar);
const MIN_PLATFORM_SPACING_MS = 15 * 60 * 1000;

function toLocalInput(value) {
  if (!value) return "";
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm");
}

function toApiDateTime(value) {
  return format(new Date(value), "yyyy-MM-dd'T'HH:mm:ss");
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

function updateEditFormSchedule(form, postId, scheduledAt) {
  if (form?.mode !== "edit" || form.post_id !== postId) return form;
  return {
    ...form,
    scheduled_at: toLocalInput(scheduledAt),
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
    .sort((first, second) => (
      (first.series?.position ?? Number.MAX_SAFE_INTEGER)
      - (second.series?.position ?? Number.MAX_SAFE_INTEGER)
    ) || new Date(first.scheduled_at) - new Date(second.scheduled_at));
}

function postToEvent(post, kind) {
  const start = new Date(post.scheduled_at);
  return {
    id: `${kind}-${post.id}`,
    title: post.title,
    start,
    end: postEventEnd(start),
    resource: { kind, post },
  };
}

function postSelectionRange(post) {
  const start = new Date(post.scheduled_at);
  return buildSelectionRange(start, postEventEnd(start));
}

function shiftedSeriesPosts(posts, startsAt) {
  const anchor = scheduledSeriesPosts(posts)[0];
  if (!anchor) return posts;
  const oldStart = new Date(anchor.scheduled_at);
  const newStart = new Date(startsAt);
  const delta = newStart.getTime() - oldStart.getTime();
  return posts.map((post) => {
    if (!post.scheduled_at) return post;
    const position = post.series?.position;
    const nextDate = position === 1
      ? newStart
      : new Date(new Date(post.scheduled_at).getTime() + delta);
    const offsetMinutes = Math.round((nextDate.getTime() - newStart.getTime()) / 60000);
    return {
      ...post,
      scheduled_at: toApiDateTime(nextDate),
      series: post.series ? {
        ...post.series,
        offset_minutes: position === 1 ? 0 : offsetMinutes,
      } : post.series,
    };
  });
}

export default function SeriesCalendarPage() {
  const { id } = useParams();
  const location = useLocation();
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
  const [selectedRange, setSelectedRange] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [seriesGroupBox, setSeriesGroupBox] = useState(null);
  const [hoveredDragMode, setHoveredDragMode] = useState(null);
  const calendarSurfaceRef = useRef(null);
  const eventNodesRef = useRef(new Map());
  const externalDragModeRef = useRef(null);

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
          starts_at: data.starts_at ? toLocalInput(data.starts_at) : "",
        });
        const firstPostDate = scheduledSeriesPosts(data.posts)[0]?.scheduled_at;
        const targetDate = queryDate || new Date(firstPostDate || data.starts_at || Date.now());
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
  const seriesAnchor = seriesPosts[0] || null;

  const events = useMemo(
    () => [
      ...(series?.posts || [])
        .filter((post) => post.scheduled_at)
        .map((post) => postToEvent(post, "series")),
      ...relatedPosts.map((post) => postToEvent(post, "context")),
    ].sort((first, second) => first.start - second.start),
    [relatedPosts, series],
  );
  const bufferEvents = useMemo(
    () => postBufferEvents(events, view),
    [events, view],
  );

  const refreshSeries = useCallback(async () => {
    const updated = await seriesApi.get(id);
    setSeries(updated);
    setSeriesForm({
      name: updated.name,
      starts_at: updated.starts_at ? toLocalInput(updated.starts_at) : "",
    });
    return updated;
  }, [id]);

  const validateSpacing = useCallback((candidates, excludedIds = new Set()) => {
    const scheduledCandidates = candidates.filter((candidate) => candidate.scheduled_at);
    for (let index = 0; index < scheduledCandidates.length; index += 1) {
      for (let next = index + 1; next < scheduledCandidates.length; next += 1) {
        if (
          Math.abs(
            new Date(scheduledCandidates[index].scheduled_at).getTime()
            - new Date(scheduledCandidates[next].scheduled_at).getTime(),
          ) < MIN_PLATFORM_SPACING_MS
        ) {
          return "Posts on the same platform must be at least 15 minutes apart.";
        }
      }
    }

    const existingPosts = [...seriesPosts, ...relatedPosts].filter((post) => (
      post.scheduled_at && !excludedIds.has(post.id)
    ));
    const conflict = scheduledCandidates.some((candidate) => (
      existingPosts.some((post) => (
        Math.abs(new Date(candidate.scheduled_at).getTime() - new Date(post.scheduled_at).getTime())
          < MIN_PLATFORM_SPACING_MS
      ))
    ));
    return conflict ? "Posts on the same platform must be at least 15 minutes apart." : "";
  }, [relatedPosts, seriesPosts]);

  const validateAppendSchedule = useCallback((scheduledAt) => {
    const nextDate = new Date(scheduledAt);
    if (seriesPosts.length > 0) {
      const lastPost = seriesPosts[seriesPosts.length - 1];
      if (nextDate <= new Date(lastPost.scheduled_at)) {
        return "Series posts must be scheduled after the current last post.";
      }
    }
    return validateSpacing([{ scheduled_at: nextDate }]);
  }, [seriesPosts, validateSpacing]);

  const validateMemberSchedule = useCallback((post, scheduledAt) => {
    const nextDate = new Date(scheduledAt);
    const position = post.series?.position;
    if (position === 1) {
      const shiftedPosts = shiftedSeriesPosts(seriesPosts, nextDate);
      return validateSpacing(
        shiftedPosts.map((candidate) => ({
          post_id: candidate.id,
          scheduled_at: candidate.scheduled_at,
        })),
        new Set(shiftedPosts.map((candidate) => candidate.id)),
      );
    }

    const currentIndex = seriesPosts.findIndex((candidate) => candidate.id === post.id);
    const previousPost = seriesPosts[currentIndex - 1];
    const nextPost = seriesPosts[currentIndex + 1];
    if (previousPost && nextDate <= new Date(previousPost.scheduled_at)) {
      return "Series posts must stay after the previous post.";
    }
    if (nextPost && nextDate >= new Date(nextPost.scheduled_at)) {
      return "Series posts must stay before the next post.";
    }
    return validateSpacing([{ post_id: post.id, scheduled_at: nextDate }], new Set([post.id]));
  }, [seriesPosts, validateSpacing]);

  const registerEventNode = useCallback((eventId, node) => {
    if (node) {
      eventNodesRef.current.set(eventId, node.closest(".rbc-event") || node);
    } else {
      eventNodesRef.current.delete(eventId);
    }
  }, []);

  const groupBoxContainer = useCallback(() => {
    if (!calendarSurfaceRef.current) return null;
    if (view === "day" || view === "week") {
      return calendarSurfaceRef.current.querySelector(".rbc-time-content") || calendarSurfaceRef.current;
    }
    return calendarSurfaceRef.current;
  }, [view]);

  const updateGroupBox = useCallback(() => {
    const container = groupBoxContainer();
    if (!container || seriesPosts.length === 0) {
      setSeriesGroupBox(null);
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const rects = seriesPosts
      .map((post) => eventNodesRef.current.get(`series-${post.id}`))
      .filter(Boolean)
      .map((node) => node.getBoundingClientRect())
      .filter((rect) => (
        rect.width > 0
        && rect.height > 0
        && rect.right >= containerRect.left
        && rect.left <= containerRect.right
        && rect.bottom >= containerRect.top
        && rect.top <= containerRect.bottom
      ));

    if (rects.length === 0) {
      setSeriesGroupBox(null);
      return;
    }

    const padding = 8;
    const scrollLeft = container.scrollLeft || 0;
    const scrollTop = container.scrollTop || 0;
    const left = Math.min(...rects.map((rect) => rect.left)) - containerRect.left + scrollLeft - padding;
    const top = Math.min(...rects.map((rect) => rect.top)) - containerRect.top + scrollTop - padding;
    const right = Math.max(...rects.map((rect) => rect.right)) - containerRect.left + scrollLeft + padding;
    const bottom = Math.max(...rects.map((rect) => rect.bottom)) - containerRect.top + scrollTop + padding;
    setSeriesGroupBox({
      container,
      left: Math.max(left, 0),
      top: Math.max(top, 0),
      width: Math.max(right - left, 32),
      height: Math.max(bottom - top, 32),
    });
  }, [groupBoxContainer, seriesPosts]);

  useLayoutEffect(() => {
    let frame = window.requestAnimationFrame(updateGroupBox);
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(updateGroupBox);
    };
    const scrollContainer = groupBoxContainer();
    window.addEventListener("resize", scheduleUpdate);
    scrollContainer?.addEventListener("scroll", scheduleUpdate, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", scheduleUpdate);
      scrollContainer?.removeEventListener("scroll", scheduleUpdate);
    };
  }, [groupBoxContainer, updateGroupBox, view, date, events]);

  const openPostForm = ({ start, end }) => {
    const range = buildSelectionRange(start, end);
    setError("");
    setSelectedEventId(null);
    setSelectedRange(range);
    setDate(range.start);
    setQuickForm(createFormForSlot(start, view));
  };

  const shiftSeriesTo = async (nextStart) => {
    if (!seriesAnchor) {
      setError("Place the first post to set the series start.");
      return false;
    }
    const validationError = validateMemberSchedule(seriesAnchor, nextStart);
    if (validationError) {
      setError(validationError);
      return false;
    }

    const previousSeries = series;
    const optimisticPosts = shiftedSeriesPosts(series.posts, nextStart);
    const optimisticStart = toApiDateTime(nextStart);
    setError("");
    setSeries((current) => ({
      ...current,
      starts_at: optimisticStart,
      posts: optimisticPosts,
    }));
    setSeriesForm((current) => ({ ...current, starts_at: toLocalInput(nextStart) }));
    setSelectedEventId(`series-${seriesAnchor.id}`);
    setSelectedRange(buildSelectionRange(new Date(nextStart), postEventEnd(nextStart)));

    try {
      const updated = await seriesApi.update(id, { starts_at: optimisticStart });
      setSeries(updated);
      setSeriesForm({
        name: updated.name,
        starts_at: updated.starts_at ? toLocalInput(updated.starts_at) : "",
      });
      const updatedAnchor = scheduledSeriesPosts(updated.posts)[0];
      if (updatedAnchor) {
        setSelectedEventId(`series-${updatedAnchor.id}`);
        setSelectedRange(postSelectionRange(updatedAnchor));
        setDate(new Date(updatedAnchor.scheduled_at));
      }
      return true;
    } catch (err) {
      setSeries(previousSeries);
      setSeriesForm({
        name: previousSeries.name,
        starts_at: previousSeries.starts_at ? toLocalInput(previousSeries.starts_at) : "",
      });
      setSelectedRange(seriesAnchor ? postSelectionRange(seriesAnchor) : null);
      setError(err.message || "Series move failed");
      return false;
    }
  };

  const saveSeries = async (event) => {
    event.preventDefault();
    setSavingSeries(true);
    setError("");
    try {
      const payload = { name: seriesForm.name };
      if (seriesAnchor && seriesForm.starts_at) {
        const validationError = validateMemberSchedule(seriesAnchor, seriesForm.starts_at);
        if (validationError) {
          setError(validationError);
          return;
        }
        payload.starts_at = seriesForm.starts_at;
      }
      const updated = await seriesApi.update(id, payload);
      setSeries(updated);
      setSeriesForm({
        name: updated.name,
        starts_at: updated.starts_at ? toLocalInput(updated.starts_at) : "",
      });
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
        const originalPost = series.posts.find((post) => post.id === quickForm.post_id);
        const validationError = originalPost
          ? validateMemberSchedule(originalPost, quickForm.scheduled_at)
          : "";
        if (validationError) {
          setError(validationError);
          return;
        }
        const updated = await postsApi.update(quickForm.post_id, {
          title: quickForm.title,
          status: quickForm.status,
          scheduled_at: quickForm.scheduled_at,
          series_role_label: quickForm.series_role_label.trim() || null,
        });
        const refreshed = await refreshSeries();
        const refreshedPost = refreshed.posts.find((post) => post.id === updated.id) || updated;
        setDate(new Date(refreshedPost.scheduled_at));
        setSelectedEventId(`series-${refreshedPost.id}`);
        setSelectedRange(postSelectionRange(refreshedPost));
        setQuickForm(editFormForPost(refreshedPost));
      } else {
        const validationError = validateAppendSchedule(quickForm.scheduled_at);
        if (validationError) {
          setError(validationError);
          return;
        }
        const created = await postsApi.create({
          title: quickForm.title,
          platform: series.platform,
          status: quickForm.status,
          scheduled_at: quickForm.scheduled_at,
          series_id: Number(id),
          series_role_label: quickForm.series_role_label.trim() || null,
        });
        const refreshed = await refreshSeries();
        const refreshedPost = refreshed.posts.find((post) => post.id === created.id) || created;
        setDate(new Date(refreshedPost.scheduled_at));
        setSelectedEventId(`series-${refreshedPost.id}`);
        setSelectedRange(postSelectionRange(refreshedPost));
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
    if (post.series?.position === 1) {
      await shiftSeriesTo(start);
      return;
    }
    const validationError = validateMemberSchedule(post, start);
    if (validationError) {
      setError(validationError);
      setSelectedEventId(event.id);
      setSelectedRange(postSelectionRange(post));
      return;
    }
    const previousPosts = series.posts;
    const optimisticSchedule = toApiDateTime(start);
    setError("");
    setSelectedEventId(event.id);
    setSelectedRange(eventSelectionRange({ ...event, start, end: postEventEnd(start) }));
    setDate(start);
    setSeries((current) => ({
      ...current,
      posts: current.posts.map((post) => (
        post.id === event.resource.post.id ? { ...post, scheduled_at: optimisticSchedule } : post
      )),
    }));
    setQuickForm((current) => updateEditFormSchedule(current, post.id, optimisticSchedule));
    try {
      const updated = await postsApi.update(post.id, { scheduled_at: optimisticSchedule });
      setSeries((current) => ({
        ...current,
        posts: current.posts.map((post) => (post.id === updated.id ? updated : post)),
      }));
      setSelectedEventId(`series-${updated.id}`);
      setSelectedRange(postSelectionRange(updated));
      setQuickForm((current) => updateEditFormSchedule(current, updated.id, updated.scheduled_at));
    } catch (err) {
      setSeries((current) => ({ ...current, posts: previousPosts }));
      setSelectedEventId(event.id);
      setSelectedRange(postSelectionRange(post));
      setQuickForm((current) => updateEditFormSchedule(current, post.id, post.scheduled_at));
      setError(err.message || "Reschedule failed");
    }
  };

  const dropStartForView = (start) => {
    const nextStart = new Date(start);
    if (view === "month" && seriesAnchor?.scheduled_at) {
      const anchorStart = new Date(seriesAnchor.scheduled_at);
      nextStart.setHours(anchorStart.getHours(), anchorStart.getMinutes(), 0, 0);
    }
    return nextStart;
  };

  const dropSeriesGroup = ({ start }) => {
    if (externalDragModeRef.current !== "series-group") return;
    shiftSeriesTo(dropStartForView(start));
  };

  const dragFromOutsideItem = () => {
    if (externalDragModeRef.current !== "series-group" || !seriesAnchor) return null;
    return postToEvent(seriesAnchor, "series");
  };

  const jumpToPost = (post) => {
    if (!post.scheduled_at) return;
    setDate(new Date(post.scheduled_at));
    setSelectedEventId(`series-${post.id}`);
    setSelectedRange(postSelectionRange(post));
    setQuickForm(editFormForPost(post));
  };

  const selectEvent = (event) => {
    setError("");
    setSelectedEventId(event.id);
    setSelectedRange(eventSelectionRange(event));
    setDate(event.start);
    if (event.resource?.kind !== "series") return;
    setQuickForm(editFormForPost(event.resource.post));
  };

  const changeCalendarView = (nextView) => {
    const nextDate = selectedRange?.start || date;
    setView(nextView);
    setDate(nextDate);
  };

  if (loading) return <div className="loading">Loading series...</div>;
  if (!series) return <div className="error">{error || "Series not found"}</div>;

  const calendarReturnTo = (
    typeof location.state?.returnTo === "string"
    && (location.state.returnTo === "/calendar" || location.state.returnTo.startsWith("/calendar?"))
  ) ? location.state.returnTo : null;
  const backLink = calendarReturnTo
    ? { to: calendarReturnTo, label: "Back to calendar" }
    : { to: "/", label: "Back to posts" };

  return (
    <div className="series-editor-page">
      <div className="page-header">
        <div>
          <h1>{series.name}</h1>
          <p className="series-subtitle">
            {series.platform} series with posts staying on cadence through offsets from the series start.
          </p>
        </div>
        <Link to={backLink.to} className="btn">{backLink.label}</Link>
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
            aria-label="Series start"
            type="datetime-local"
            value={seriesForm.starts_at}
            onChange={(event) => setSeriesForm((current) => ({ ...current, starts_at: event.target.value }))}
            disabled={!seriesAnchor}
            required={Boolean(seriesAnchor)}
          />
          {!seriesAnchor && (
            <span className="field-hint">Place the first post to set the series start.</span>
          )}
        </label>
        <button type="submit" className="btn primary" disabled={savingSeries}>
          {savingSeries ? "Saving..." : "Save series"}
        </button>
      </form>
      <div className="series-editor-grid">
        <div className="calendar-wrap series-calendar-wrap" ref={calendarSurfaceRef}>
          <DragAndDropCalendar
            localizer={localizer}
            events={events}
            backgroundEvents={bufferEvents}
            selectable
            resizable={false}
            views={["month", "week", "day", "agenda"]}
            view={view}
            date={date}
            onView={changeCalendarView}
            onNavigate={(nextDate) => setDate(nextDate)}
            onDrillDown={(date) => openPostForm({ start: date })}
            onSelectSlot={openPostForm}
            onSelectEvent={selectEvent}
            onEventDrop={moveEvent}
            onDropFromOutside={dropSeriesGroup}
            dragFromOutsideItem={dragFromOutsideItem}
            draggableAccessor={(event) => event.resource.kind === "series"}
            startAccessor="start"
            endAccessor="end"
            titleAccessor="title"
            style={{ height: 640 }}
            dayPropGetter={(day) => calendarDaySelectionProps(day, selectedRange)}
            slotPropGetter={(slotStart) => calendarSlotSelectionProps(slotStart, selectedRange)}
            eventPropGetter={(event) => {
              if (event.resource?.kind === "post-buffer") {
                return { className: "post-buffer-event" };
              }
              if (event.resource.kind === "context") {
                return {
                  className: [
                    "related-platform-event",
                    event.id === selectedEventId ? "calendar-selected-event" : "",
                  ].filter(Boolean).join(" "),
                  style: {
                    backgroundColor: "#e5e7eb",
                    borderColor: "#d1d5db",
                    color: "#374151",
                  },
                };
              }
              return {
                className: [
                  "series-editor-event",
                  event.resource.post.series?.position === 1 ? "series-anchor-event" : "",
                  hoveredDragMode === "group" ? "series-group-hover-event" : "",
                  hoveredDragMode === "anchor" && event.resource.post.series?.position === 1
                    ? "series-anchor-hover-event"
                    : "",
                  event.id === selectedEventId ? "calendar-selected-event" : "",
                ].filter(Boolean).join(" "),
                style: {
                  backgroundColor: event.resource.post.status === "published" ? "#15803d" : "#0f766e",
                },
              };
            }}
            components={{
              event: ({ event }) => (
                event.resource?.kind === "post-buffer" ? (
                  <span className="post-buffer-label">15-minute buffer</span>
                ) : (
                  <div
                    ref={(node) => registerEventNode(event.id, node)}
                    className="series-event-content"
                    onMouseEnter={() => {
                      if (event.resource.kind === "series" && event.resource.post.series?.position === 1) {
                        setHoveredDragMode("anchor");
                      }
                    }}
                    onMouseLeave={() => setHoveredDragMode(null)}
                  >
                    {event.resource.kind === "series" && event.resource.post.series?.position && (
                      <strong className="series-event-position">
                        #{event.resource.post.series.position}
                      </strong>
                    )}
                    <span>{event.title}</span>
                    {event.resource.kind === "context" ? (
                      <em>same-platform post</em>
                    ) : event.resource.post.series?.position === 1 ? (
                      <em className="series-start-badge">Series start</em>
                    ) : (
                      event.resource.post.series?.role_label && <em>{event.resource.post.series.role_label}</em>
                    )}
                  </div>
                )
              ),
            }}
          />
          {seriesGroupBox?.container && seriesPosts.length > 0 && createPortal(
            <div
              aria-label="Move series"
              className={[
                "series-group-drag-box",
                hoveredDragMode === "group" ? "is-hovered" : "",
              ].filter(Boolean).join(" ")}
              draggable
              onDragStart={(event) => {
                externalDragModeRef.current = "series-group";
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", "series-group");
              }}
              onDragEnd={() => {
                externalDragModeRef.current = null;
                setHoveredDragMode(null);
              }}
              onMouseEnter={() => setHoveredDragMode("group")}
              onMouseLeave={() => setHoveredDragMode(null)}
              style={{
                left: seriesGroupBox.left,
                top: seriesGroupBox.top,
                width: seriesGroupBox.width,
                height: seriesGroupBox.height,
              }}
              title="Move series"
            />,
            seriesGroupBox.container,
          )}
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
                {quickForm.mode === "edit" && (
                  <label>
                    Platform
                    <input type="text" value={series.platform} disabled />
                  </label>
                )}
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
                <p>
                  {seriesPosts.length === 0
                    ? "Place the first post to set the series start."
                    : "Select a day or time slot on the calendar to schedule a series post."}
                </p>
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
                    <span>
                      {post.series?.position ? `#${post.series.position} ` : ""}
                      {post.title}
                    </span>
                    <em>
                      {post.series?.position === 1 ? "Series start - " : ""}
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
