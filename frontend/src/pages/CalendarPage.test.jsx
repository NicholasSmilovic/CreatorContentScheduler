import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "./CalendarPage";
import { postsApi } from "../api/client";

vi.mock("../api/client", () => ({
  postsApi: { list: vi.fn() },
}));

const calendarPosts = [
  {
    id: 1,
    title: "Launch teaser",
    status: "scheduled",
    platform: "instagram",
    scheduled_at: "2026-05-22T09:00:00Z",
        series: { id: 4, name: "Launch", position: 1, role_label: "Teaser", offset_minutes: 0 },
  },
  {
    id: 2,
    title: "Launch follow-up",
    status: "scheduled",
    platform: "linkedin",
    scheduled_at: "2026-05-23T09:00:00Z",
        series: { id: 4, name: "Launch", position: 2, role_label: "Follow-up", offset_minutes: 1440 },
  },
];

function LocationProbe() {
  const location = useLocation();
  return (
    <div data-testid="location">
      {location.pathname}
      {location.search}
      {location.state?.returnTo ? `:${location.state.returnTo}` : ""}
    </div>
  );
}

function renderPage(initialEntry = "/calendar") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/calendar" element={<><CalendarPage /><LocationProbe /></>} />
        <Route path="/series/:id" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    postsApi.list.mockResolvedValue(calendarPosts);
  });

  it("highlights visible sibling events when a series post is hovered", async () => {
    const { container } = renderPage();

    fireEvent.mouseEnter(await screen.findByText("Launch teaser"));

    await waitFor(() => {
      expect(container.querySelectorAll(".series-related-event")).toHaveLength(2);
    });
  });

  it("keeps toolbar date navigation working", async () => {
    const { container } = renderPage();

    await screen.findByText("Launch teaser");
    const currentLabel = container.querySelector(".rbc-toolbar-label").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(container.querySelector(".rbc-toolbar-label").textContent).not.toBe(currentLabel);
    });
    expect(screen.getByTestId("location")).toHaveTextContent("date=");
  });

  it("filters scheduled events by platform", async () => {
    postsApi.list
      .mockResolvedValueOnce(calendarPosts)
      .mockResolvedValueOnce([calendarPosts[0]]);
    renderPage();

    await screen.findByText("Launch follow-up");
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "instagram" } });

    await waitFor(() => {
      expect(postsApi.list).toHaveBeenLastCalledWith({ platform: "instagram" });
    });
    expect(screen.getByTestId("location")).toHaveTextContent("platform=instagram");
    expect(await screen.findByText("Launch teaser")).toBeInTheDocument();
    expect(screen.queryByText("Launch follow-up")).not.toBeInTheDocument();
  });

  it("opens the series editor when a series event is clicked", async () => {
    renderPage();

    fireEvent.click(await screen.findByText("Launch teaser"));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/series/4:/calendar");
    });
  });

  it("restores calendar query state and keeps it in the series return link", async () => {
    renderPage("/calendar?platform=instagram&view=week&date=2026-05-22");

    expect(await screen.findByLabelText("Platform")).toHaveValue("instagram");
    expect(postsApi.list).toHaveBeenCalledWith({ platform: "instagram" });

    fireEvent.click(await screen.findByText("Launch teaser"));

    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/series/4:/calendar?platform=instagram&view=week&date=2026-05-22",
      );
    });
  });
});
