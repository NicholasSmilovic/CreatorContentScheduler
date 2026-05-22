import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeriesCalendarPage from "./SeriesCalendarPage";
import { postsApi, seriesApi } from "../api/client";

vi.mock("react-big-calendar", () => ({
  Calendar: ({
    backgroundEvents = [],
    date,
    events = [],
    view,
    components = {},
    dayPropGetter,
    slotPropGetter,
    onSelectEvent,
    onSelectSlot,
    onEventDrop,
    onView,
  }) => {
    const seriesEvent = (
      events.find((event) => event.resource?.kind === "series" && event.resource.post.series?.position === 2)
      || events.find((event) => event.resource?.kind === "series")
    );
    const selectedDayProps = dayPropGetter?.(new Date("2026-06-18T00:00:00")) || {};
    const selectedSlotProps = slotPropGetter?.(new Date("2026-06-18T15:30:00")) || {};
    const activeDate = date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "";
    const firstBuffer = backgroundEvents[0];
    const formatTime = (value) => (
      `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
    );
    const EventComponent = components.event;
    const setTimeContentRect = (node) => {
      if (!node) return;
      node.getBoundingClientRect = () => ({
        bottom: 500,
        height: 400,
        left: 100,
        right: 500,
        top: 100,
        width: 400,
      });
    };
    const setEventRect = (index) => (node) => {
      if (!node) return;
      node.getBoundingClientRect = () => ({
        bottom: 210 + index * 48,
        height: 20,
        left: 150,
        right: 260,
        top: 190 + index * 48,
        width: 110,
      });
    };
    return (
      <div>
        <div data-testid="series-active-date">{activeDate}</div>
        <div data-testid="series-active-view">{view}</div>
        <div data-testid="series-buffer-count">{backgroundEvents.length}</div>
        <div data-testid="series-first-buffer">
          {firstBuffer ? `${formatTime(firstBuffer.start)}-${formatTime(firstBuffer.end)}` : ""}
        </div>
        <div
          className={view === "day" || view === "week" ? "rbc-time-content" : "rbc-month-view"}
          data-testid="series-calendar-scroll-surface"
          ref={view === "day" || view === "week" ? setTimeContentRect : undefined}
        >
          {events.map((event, index) => (
            <div
              className="rbc-event"
              key={`rendered-${event.id}`}
              ref={setEventRect(index)}
            >
              {EventComponent ? <EventComponent event={event} /> : event.title}
            </div>
          ))}
        </div>
        <div data-testid="series-selected-day" className={selectedDayProps.className || ""} />
        <div data-testid="series-selected-slot" className={selectedSlotProps.className || ""} />
        {events.map((event) => (
          <button
            key={event.id}
            type="button"
            aria-label={`calendar event ${event.title}`}
            onClick={() => onSelectEvent?.(event)}
          >
            {event.title}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onSelectSlot?.({
            start: new Date("2026-06-18T15:30:00"),
            end: new Date("2026-06-18T16:00:00"),
          })}
        >
          Select series slot
        </button>
        <button type="button" onClick={() => onView?.("day")}>
          Switch series day
        </button>
        <button
          type="button"
          onClick={() => onEventDrop?.({
            event: seriesEvent,
            start: new Date("2026-06-18T15:30:00"),
          })}
        >
          Move calendar event
        </button>
      </div>
    );
  },
  dateFnsLocalizer: () => ({}),
}));

vi.mock("react-big-calendar/lib/addons/dragAndDrop", () => ({
  default: (CalendarComponent) => CalendarComponent,
}));

vi.mock("../api/client", () => ({
  postsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
  seriesApi: { get: vi.fn(), update: vi.fn() },
}));

const seriesPost = {
  id: 1,
  title: "Series announcement",
  platform: "instagram",
  status: "scheduled",
  scheduled_at: "2026-06-17T09:00:00",
  series: {
    id: 8,
    name: "Launch",
    platform: "instagram",
    position: 1,
    role_label: "Announcement",
    offset_minutes: 0,
  },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/series/8"]}>
      <Routes>
        <Route path="/series/:id" element={<SeriesCalendarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SeriesCalendarPage drag-and-drop saving", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seriesApi.get.mockResolvedValue({
      id: 8,
      name: "Launch",
      platform: "instagram",
      starts_at: "2026-06-17T08:00:00",
      posts: [seriesPost],
    });
    postsApi.list.mockResolvedValue([]);
    postsApi.create.mockResolvedValue({});
    seriesApi.update.mockResolvedValue({});
  });

  it("keeps the selected day and time slot visible when adding a post", async () => {
    renderPage();

    await screen.findByRole("button", { name: "calendar event Series announcement" });
    expect(screen.getByTestId("series-selected-day")).not.toHaveClass("calendar-selected-day");
    expect(screen.getByTestId("series-selected-slot")).not.toHaveClass("calendar-selected-slot");

    fireEvent.click(screen.getByRole("button", { name: "Select series slot" }));

    expect(await screen.findByRole("heading", { name: "Add post" })).toBeInTheDocument();
    expect(screen.getByTestId("series-selected-day")).toHaveClass("calendar-selected-day");
    expect(screen.getByTestId("series-selected-slot")).toHaveClass("calendar-selected-slot");
    expect(screen.getByTestId("series-active-date")).toHaveTextContent("2026-06-18");

    fireEvent.click(screen.getByRole("button", { name: "Switch series day" }));

    expect(screen.getByTestId("series-active-view")).toHaveTextContent("day");
    expect(screen.getByTestId("series-active-date")).toHaveTextContent("2026-06-18");
  });

  it("shows 15-minute buffers in day and week views", async () => {
    renderPage();

    await screen.findByRole("button", { name: "calendar event Series announcement" });
    expect(screen.getByTestId("series-buffer-count")).toHaveTextContent("0");

    fireEvent.click(screen.getByRole("button", { name: "Switch series day" }));

    expect(screen.getByTestId("series-active-view")).toHaveTextContent("day");
    expect(screen.getByTestId("series-buffer-count")).toHaveTextContent("1");
    expect(screen.getByTestId("series-first-buffer")).toHaveTextContent("08:45-09:15");
  });

  it("renders the whole-series drag box inside the time-grid scroll container", async () => {
    renderPage();

    await screen.findByRole("button", { name: "calendar event Series announcement" });
    fireEvent.click(screen.getByRole("button", { name: "Switch series day" }));

    await waitFor(() => {
      expect(screen.getByLabelText("Move series").closest(".rbc-time-content")).toBe(
        screen.getByTestId("series-calendar-scroll-surface"),
      );
    });
  });

  it("does not overwrite a calendar-moved post time when saving the open edit form", async () => {
    const anchorPost = {
      ...seriesPost,
      id: 10,
      title: "Series start",
      scheduled_at: "2026-06-17T08:00:00",
      series: {
        ...seriesPost.series,
        position: 1,
      },
    };
    const editablePost = {
      ...seriesPost,
      id: 1,
      scheduled_at: "2026-06-17T09:00:00",
      series: {
        ...seriesPost.series,
        position: 2,
        offset_minutes: 60,
      },
    };
    const movedPost = {
      ...editablePost,
      scheduled_at: "2026-06-18T15:30:00",
      series: {
        ...editablePost.series,
        offset_minutes: 1890,
      },
    };
    const savedPost = {
      ...movedPost,
      title: "Updated announcement",
    };
    postsApi.update
      .mockResolvedValueOnce(movedPost)
      .mockResolvedValueOnce(savedPost);
    seriesApi.get.mockResolvedValueOnce({
      id: 8,
      name: "Launch",
      platform: "instagram",
      starts_at: "2026-06-17T08:00:00",
      posts: [anchorPost, editablePost],
    });

    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "calendar event Series announcement" }));

    const scheduledInput = await screen.findByLabelText("Scheduled at");
    expect(scheduledInput).toHaveValue("2026-06-17T09:00");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Updated announcement" } });
    fireEvent.click(screen.getByRole("button", { name: "Move calendar event" }));

    await waitFor(() => expect(scheduledInput).toHaveValue("2026-06-18T15:30"));
    expect(screen.getByLabelText("Title")).toHaveValue("Updated announcement");
    await waitFor(() => expect(postsApi.update).toHaveBeenCalledWith(1, {
      scheduled_at: "2026-06-18T15:30:00",
    }));

    fireEvent.click(screen.getByRole("button", { name: "Save post" }));

    await waitFor(() => expect(postsApi.update).toHaveBeenCalledTimes(2));
    expect(postsApi.update).toHaveBeenLastCalledWith(1, expect.objectContaining({
      title: "Updated announcement",
      scheduled_at: "2026-06-18T15:30",
    }));
  });
});
