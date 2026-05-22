import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { postsApi } from "../api/client";
import {
  buildSelectionRange,
  calendarDaySelectionProps,
  calendarSlotSelectionProps,
  eventSelectionRange,
  postBufferEvents,
  postEventEnd,
} from "../utils/calendarSelection";

const PLATFORMS = ["youtube", "instagram", "twitter", "tiktok", "linkedin"];
const CALENDAR_VIEWS = ["month", "week", "day", "agenda"];
const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function platformFromQuery(value) {
  return PLATFORMS.includes(value) ? value : "";
}

function viewFromQuery(value) {
  return CALENDAR_VIEWS.includes(value) ? value : "month";
}

function dateFromQuery(value) {
  if (!value) return new Date();
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return new Date();
  const [year, month, day] = parts;
  return new Date(year, month - 1, day);
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [platformFilter, setPlatformFilter] = useState(() => platformFromQuery(searchParams.get("platform")));
  const [view, setView] = useState(() => viewFromQuery(searchParams.get("view")));
  const [date, setDate] = useState(() => dateFromQuery(searchParams.get("date")));
  const [hoveredSeriesId, setHoveredSeriesId] = useState(null);
  const [selectedRange, setSelectedRange] = useState(null);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [connectorLines, setConnectorLines] = useState([]);
  const calendarSurfaceRef = useRef(null);
  const eventNodesRef = useRef(new Map());

  useEffect(() => {
    let cancelled = false;
    const params = platformFilter ? { platform: platformFilter } : {};
    postsApi
      .list(params)
      .then((posts) => {
        if (cancelled) return;
        const evts = posts
          .filter((p) => p.scheduled_at)
          .map((p) => ({
            id: p.id,
            title: p.title,
            start: new Date(p.scheduled_at),
            end: postEventEnd(p.scheduled_at),
            resource: { platform: p.platform, status: p.status, series: p.series },
          }));
        setEvents(evts);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [platformFilter]);

  const updateCalendarSearch = useCallback((nextState) => {
    const params = new URLSearchParams();
    if (nextState.platform) params.set("platform", nextState.platform);
    if (nextState.view !== "month") params.set("view", nextState.view);
    params.set("date", format(nextState.date, "yyyy-MM-dd"));
    setSearchParams(params, { replace: true });
  }, [setSearchParams]);

  const relatedEvents = useMemo(
    () => events
      .filter((event) => event.resource.series?.id === hoveredSeriesId)
      .sort((first, second) => first.start - second.start),
    [events, hoveredSeriesId],
  );
  const bufferEvents = useMemo(
    () => postBufferEvents(events, view),
    [events, view],
  );

  const registerEventNode = useCallback((eventId, node) => {
    if (node) {
      eventNodesRef.current.set(eventId, node);
    } else {
      eventNodesRef.current.delete(eventId);
    }
  }, []);

  const updateConnectorLines = useCallback(() => {
    if (!calendarSurfaceRef.current || !hoveredSeriesId) {
      setConnectorLines([]);
      return;
    }

    const surface = calendarSurfaceRef.current.getBoundingClientRect();
    const centers = relatedEvents
      .map((event) => {
        const node = eventNodesRef.current.get(event.id);
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const outsideSurface = (
          rect.width === 0
          || rect.height === 0
          || rect.right < surface.left
          || rect.left > surface.right
          || rect.bottom < surface.top
          || rect.top > surface.bottom
        );
        if (outsideSurface) return null;
        return {
          id: event.id,
          x: rect.left - surface.left + rect.width / 2,
          y: rect.top - surface.top + rect.height / 2,
        };
      })
      .filter(Boolean);

    setConnectorLines(centers.slice(1).map((center, index) => ({
      id: `${centers[index].id}-${center.id}`,
      from: centers[index],
      to: center,
    })));
  }, [hoveredSeriesId, relatedEvents]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(updateConnectorLines);
    window.addEventListener("resize", updateConnectorLines);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateConnectorLines);
    };
  }, [updateConnectorLines, view]);

  const CalendarEvent = useCallback(({ event }) => {
    if (event.resource?.kind === "post-buffer") {
      return <span className="post-buffer-label">15-minute buffer</span>;
    }
    return (
      <div
        ref={(node) => registerEventNode(event.id, node)}
        className="calendar-event-content"
        onMouseEnter={() => setHoveredSeriesId(event.resource.series?.id || null)}
        onMouseLeave={() => setHoveredSeriesId(null)}
      >
        <span>{event.title}</span>
        {event.resource.series && (
          <em>
            {event.resource.series.position ? `#${event.resource.series.position}` : ""}
            {event.resource.series.role_label ? ` ${event.resource.series.role_label}` : ""}
          </em>
        )}
      </div>
    );
  }, [registerEventNode]);

  const openSeriesEditor = (event) => {
    setSelectedRange(eventSelectionRange(event));
    setSelectedEventId(event.id);
    setDate(event.start);
    const seriesId = event.resource.series?.id;
    if (!seriesId) return;
    navigate(`/series/${seriesId}`, { state: { returnTo: `${location.pathname}${location.search}` } });
  };

  const selectSlot = ({ start, end }) => {
    const range = buildSelectionRange(start, end);
    setHoveredSeriesId(null);
    setSelectedEventId(null);
    setSelectedRange(range);
    setDate(range.start);
    updateCalendarSearch({ platform: platformFilter, view, date: range.start });
  };

  const selectDrilldownDate = (nextDate) => {
    setHoveredSeriesId(null);
    setSelectedEventId(null);
    setSelectedRange(buildSelectionRange(nextDate));
    setDate(nextDate);
    updateCalendarSearch({ platform: platformFilter, view, date: nextDate });
  };

  if (loading) return <div className="loading">Loading calendar…</div>;

  return (
    <div className="calendar-page">
      <h1>Calendar</h1>
      <p className="calendar-hint">Scheduled posts appear as events. Only posts with a scheduled time are shown.</p>
      <div className="calendar-filters">
        <label>
          Platform
          <select
            value={platformFilter}
            onChange={(event) => {
              const nextPlatform = event.target.value;
              setHoveredSeriesId(null);
              setSelectedEventId(null);
              setSelectedRange(null);
              setPlatformFilter(nextPlatform);
              updateCalendarSearch({ platform: nextPlatform, view, date });
            }}
          >
            <option value="">All platforms</option>
            {PLATFORMS.map((platform) => (
              <option key={platform} value={platform}>{platform}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="calendar-wrap series-line-surface" ref={calendarSurfaceRef}>
        <svg className="series-connectors" aria-hidden="true">
          {connectorLines.map((line) => (
            <line
              key={line.id}
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
            />
          ))}
        </svg>
        <Calendar
          localizer={localizer}
          events={events}
          backgroundEvents={bufferEvents}
          selectable
          views={CALENDAR_VIEWS}
          view={view}
          date={date}
          onView={(nextView) => {
            const nextDate = selectedRange?.start || date;
            setHoveredSeriesId(null);
            setSelectedEventId(null);
            setView(nextView);
            setDate(nextDate);
            updateCalendarSearch({ platform: platformFilter, view: nextView, date: nextDate });
          }}
          onNavigate={(nextDate, nextView, action) => {
            setHoveredSeriesId(null);
            setSelectedEventId(null);
            setSelectedRange(action === "DATE" ? buildSelectionRange(nextDate) : null);
            setDate(nextDate);
            updateCalendarSearch({ platform: platformFilter, view, date: nextDate });
          }}
          onSelectEvent={openSeriesEditor}
          onSelectSlot={selectSlot}
          onDrillDown={selectDrilldownDate}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          style={{ height: 600 }}
          dayPropGetter={(day) => calendarDaySelectionProps(day, selectedRange)}
          slotPropGetter={(slotStart) => calendarSlotSelectionProps(slotStart, selectedRange)}
          eventPropGetter={(event) => {
            if (event.resource?.kind === "post-buffer") {
              return { className: "post-buffer-event" };
            }
            return {
              className: [
                event.resource.series?.id === hoveredSeriesId ? "series-related-event" : "",
                event.resource.series?.id ? "series-openable-event" : "",
                event.id === selectedEventId ? "calendar-selected-event" : "",
              ].filter(Boolean).join(" "),
              style: {
                backgroundColor: event.resource?.status === "published" ? "#22c55e" : "#3b82f6",
              },
            };
          }}
          components={{ event: CalendarEvent }}
        />
      </div>
    </div>
  );
}
