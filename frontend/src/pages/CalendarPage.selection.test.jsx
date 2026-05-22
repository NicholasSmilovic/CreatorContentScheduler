import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "./CalendarPage";
import { postsApi } from "../api/client";

vi.mock("react-big-calendar", () => ({
  Calendar: ({
    dayPropGetter,
    slotPropGetter,
    onSelectSlot,
  }) => {
    const selectedDayProps = dayPropGetter?.(new Date("2026-05-22T00:00:00")) || {};
    const selectedSlotProps = slotPropGetter?.(new Date("2026-05-22T10:00:00")) || {};

    return (
      <div>
        <div data-testid="main-selected-day" className={selectedDayProps.className || ""} />
        <div data-testid="main-selected-slot" className={selectedSlotProps.className || ""} />
        <button
          type="button"
          onClick={() => onSelectSlot?.({
            start: new Date("2026-05-22T10:00:00"),
            end: new Date("2026-05-22T10:30:00"),
          })}
        >
          Select calendar slot
        </button>
      </div>
    );
  },
  dateFnsLocalizer: () => ({}),
}));

vi.mock("../api/client", () => ({
  postsApi: { list: vi.fn() },
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/calendar"]}>
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
    expect(screen.getByTestId("main-selected-slot")).not.toHaveClass("calendar-selected-slot");

    fireEvent.click(screen.getByRole("button", { name: "Select calendar slot" }));

    expect(screen.getByTestId("main-selected-day")).toHaveClass("calendar-selected-day");
    expect(screen.getByTestId("main-selected-slot")).toHaveClass("calendar-selected-slot");
  });
});
