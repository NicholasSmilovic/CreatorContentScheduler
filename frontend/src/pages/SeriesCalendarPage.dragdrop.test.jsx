import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeriesCalendarPage from "./SeriesCalendarPage";
import { postsApi, seriesApi } from "../api/client";

vi.mock("react-big-calendar", () => ({
  Calendar: ({
    events = [],
    dayPropGetter,
    slotPropGetter,
    onSelectEvent,
    onSelectSlot,
    onEventDrop,
  }) => {
    const seriesEvent = events.find((event) => event.resource?.kind === "series");
    const selectedDayProps = dayPropGetter?.(new Date("2026-06-18T00:00:00")) || {};
    const selectedSlotProps = slotPropGetter?.(new Date("2026-06-18T15:30:00")) || {};
    return (
      <div>
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
  });

  it("does not overwrite a calendar-moved post time when saving the open edit form", async () => {
    const movedPost = {
      ...seriesPost,
      scheduled_at: "2026-06-18T15:30:00",
      series: {
        ...seriesPost.series,
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
