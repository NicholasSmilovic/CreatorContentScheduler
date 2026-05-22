import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import { format, parse, startOfWeek, getDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { postsApi } from "../api/client";

const locales = { "en-US": enUS };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("month");
  const [date, setDate] = useState(new Date());
  const [hoveredSeriesId, setHoveredSeriesId] = useState(null);
  const [connectorLines, setConnectorLines] = useState([]);
  const calendarSurfaceRef = useRef(null);
  const eventNodesRef = useRef(new Map());

  useEffect(() => {
    postsApi
      .list()
      .then((posts) => {
        const evts = posts
          .filter((p) => p.scheduled_at)
          .map((p) => ({
            id: p.id,
            title: p.title,
            start: new Date(p.scheduled_at),
            end: new Date(new Date(p.scheduled_at).getTime() + 60 * 60 * 1000),
            resource: { platform: p.platform, status: p.status, series: p.series },
          }));
        setEvents(evts);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const relatedEvents = useMemo(
    () => events
      .filter((event) => event.resource.series?.id === hoveredSeriesId)
      .sort((first, second) => first.start - second.start),
    [events, hoveredSeriesId],
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

  const CalendarEvent = useCallback(({ event }) => (
    <div
      ref={(node) => registerEventNode(event.id, node)}
      className="calendar-event-content"
      onMouseEnter={() => setHoveredSeriesId(event.resource.series?.id || null)}
      onMouseLeave={() => setHoveredSeriesId(null)}
    >
      <span>{event.title}</span>
      {event.resource.series?.role_label && <em>{event.resource.series.role_label}</em>}
    </div>
  ), [registerEventNode]);

  if (loading) return <div className="loading">Loading calendar…</div>;

  return (
    <div className="calendar-page">
      <h1>Calendar</h1>
      <p className="calendar-hint">Scheduled posts appear as events. Only posts with a scheduled time are shown.</p>
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
          views={["month", "week", "day", "agenda"]}
          view={view}
          date={date}
          onView={(nextView) => {
            setHoveredSeriesId(null);
            setView(nextView);
          }}
          onNavigate={(nextDate) => {
            setHoveredSeriesId(null);
            setDate(nextDate);
          }}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          style={{ height: 600 }}
          eventPropGetter={(event) => ({
            className: event.resource.series?.id === hoveredSeriesId ? "series-related-event" : "",
            style: {
              backgroundColor: event.resource?.status === "published" ? "#22c55e" : "#3b82f6",
            },
          })}
          components={{ event: CalendarEvent }}
        />
      </div>
    </div>
  );
}
