import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "./CalendarPage";
import { postsApi } from "../api/client";

vi.mock("react-big-calendar", () => ({
  Calendar: ({
    backgroundEvents = [],
    date,
    view,
    dayPropGetter,
    eventPropGetter,
    slotPropGetter,
    onDrillDown,
    onNavigate,
    onSelectSlot,
    onView,
  }) => {
    const selectedDayProps = dayPropGetter?.(new Date("2026-05-22T00:00:00")) || {};
    const clickedDayProps = dayPropGetter?.(new Date("2026-05-20T00:00:00")) || {};
    const selectedSlotProps = slotPropGetter?.(new Date("2026-05-22T10:00:00")) || {};
    const activeDate = date
      ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
      : "";
    const firstBuffer = backgroundEvents[0];
    const firstBufferClass = firstBuffer ? eventPropGetter?.(firstBuffer)?.className || "" : "";
    const formatTime = (value) => (
      `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
    );

    return (
      <div>
        <div data-testid="main-active-date">{activeDate}</div>
        <div data-testid="main-active-view">{view}</div>
        <div data-testid="main-buffer-count">{backgroundEvents.length}</div>
        <div data-testid="main-first-buffer">
          {firstBuffer ? `${formatTime(firstBuffer.start)}-${formatTime(firstBuffer.end)}` : ""}
        </div>
        <div data-testid="main-first-buffer-class">{firstBufferClass}</div>
        <div data-testid="main-selected-day" className={selectedDayProps.className || ""} />
        <div data-testid="main-clicked-day" className={clickedDayProps.className || ""} />
        <div data-testid="main-selected-slot" className={selectedSlotProps.className || ""} />
        <button
          type="button"
          onClick={() => onDrillDown?.(new Date("2026-05-20T00:00:00"))}
        >
          Click month day
        </button>
        <button
          type="button"
          onClick={() => onNavigate?.(new Date("2026-05-20T00:00:00"), "month", "DATE")}
        >
          Navigate to day
        </button>
        <button
          type="button"
          onClick={() => onSelectSlot?.({
            start: new Date("2026-05-31T09:00:00"),
            end: new Date("2026-05-31T09:30:00"),
          })}
        >
          Select May 31 slot
        </button>
        <button
          type="button"
          onClick={() => onSelectSlot?.({
            start: new Date("2026-05-22T10:00:00"),
            end: new Date("2026-05-22T10:30:00"),
          })}
        >
          Select calendar slot
        </button>
        <button type="button" onClick={() => onView?.("week")}>
          Switch week
        </button>
      </div>
    );
  },
  dateFnsLocalizer: () => ({}),
}));

vi.mock("../api/client", () => ({
  postsApi: { list: vi.fn() },
}));

function renderPage(initialEntry = "/calendar") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/calendar" element={<CalendarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CalendarPage selection display", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postsApi.list.mockResolvedValue([]);
  });

  it("keeps the selected day and time slot visible", async () => {
    renderPage();

    await waitFor(() => expect(postsApi.list).toHaveBeenCalled());
    expect(screen.getByTestId("main-selected-day")).not.toHaveClass("calendar-selected-day");
    expect(screen.getByTestId("main-clicked-day")).not.toHaveClass("calendar-selected-day");
    expect(screen.getByTestId("main-selected-slot")).not.toHaveClass("calendar-selected-slot");

    fireEvent.click(screen.getByRole("button", { name: "Select calendar slot" }));

    expect(screen.getByTestId("main-selected-day")).toHaveClass("calendar-selected-day");
    expect(screen.getByTestId("main-selected-slot")).toHaveClass("calendar-selected-slot");
  });

  it("shows 15-minute post buffers only in week and day views", async () => {
    const scheduledPost = {
      id: 1,
      title: "Launch teaser",
      platform: "instagram",
      status: "scheduled",
      scheduled_at: "2026-05-22T10:00:00",
      series: null,
    };
    postsApi.list.mockResolvedValueOnce([scheduledPost]);
    const { unmount } = renderPage("/calendar?view=week&date=2026-05-22");

    await waitFor(() => expect(screen.getByTestId("main-buffer-count")).toHaveTextContent("1"));
    expect(screen.getByTestId("main-first-buffer")).toHaveTextContent("09:45-10:15");
    expect(screen.getByTestId("main-first-buffer-class")).toHaveTextContent("post-buffer-event");

    unmount();
    postsApi.list.mockResolvedValueOnce([scheduledPost]);
    renderPage("/calendar?date=2026-05-22");

    await waitFor(() => expect(screen.getByTestId("main-buffer-count")).toHaveTextContent("0"));
  });

  it("keeps a clicked month day visible", async () => {
    renderPage();

    await waitFor(() => expect(postsApi.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Click month day" }));

    expect(screen.getByTestId("main-clicked-day")).toHaveClass("calendar-selected-day");
  });

  it("uses the selected date when switching views", async () => {
    renderPage();

    await waitFor(() => expect(postsApi.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Select May 31 slot" }));

    expect(screen.getByTestId("main-active-date")).toHaveTextContent("2026-05-31");

    fireEvent.click(screen.getByRole("button", { name: "Switch week" }));

    expect(screen.getByTestId("main-active-view")).toHaveTextContent("week");
    expect(screen.getByTestId("main-active-date")).toHaveTextContent("2026-05-31");
  });

  it("keeps a date navigation selection visible", async () => {
    renderPage();

    await waitFor(() => expect(postsApi.list).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Navigate to day" }));

    expect(screen.getByTestId("main-clicked-day")).toHaveClass("calendar-selected-day");
  });
});
