import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeriesCalendarPage from "./SeriesCalendarPage";
import { postsApi, seriesApi } from "../api/client";

vi.mock("../api/client", () => ({
  postsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() },
  seriesApi: { get: vi.fn(), update: vi.fn() },
}));

function scheduledAt(hour = 9) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

const seriesPost = {
  id: 1,
  title: "Series announcement",
  platform: "instagram",
  status: "scheduled",
  scheduled_at: scheduledAt(9),
  series: {
    id: 8,
    name: "Launch",
    platform: "instagram",
    role_label: "Announcement",
    offset_minutes: 0,
  },
};

function renderPage(initialEntry = "/series/8") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/series/:id" element={<SeriesCalendarPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("SeriesCalendarPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seriesApi.get.mockResolvedValue({
      id: 8,
      name: "Launch",
      platform: "instagram",
      starts_at: scheduledAt(8),
      posts: [seriesPost],
    });
    postsApi.list.mockResolvedValue([
      seriesPost,
      {
        id: 2,
        title: "Existing Instagram post",
        platform: "instagram",
        status: "scheduled",
        scheduled_at: scheduledAt(11),
        series: null,
      },
      {
        id: 3,
        title: "LinkedIn context post",
        platform: "linkedin",
        status: "scheduled",
        scheduled_at: scheduledAt(12),
        series: null,
      },
      {
        id: 4,
        title: "Unscheduled Instagram draft",
        platform: "instagram",
        status: "draft",
        scheduled_at: null,
        series: null,
      },
    ]);
    postsApi.create.mockResolvedValue({
      id: 5,
      title: "Quick post",
      platform: "instagram",
      status: "scheduled",
      scheduled_at: scheduledAt(13),
      series: {
        id: 8,
        name: "Launch",
        platform: "instagram",
        role_label: null,
        offset_minutes: 300,
      },
    });
    postsApi.update.mockResolvedValue(seriesPost);
  });

  it("keeps toolbar date navigation working", async () => {
    const { container } = renderPage();

    await screen.findAllByText("Series announcement");
    const currentLabel = container.querySelector(".rbc-toolbar-label").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(container.querySelector(".rbc-toolbar-label").textContent).not.toBe(currentLabel);
    });
  });

  it("links back to the main calendar when opened from the calendar", async () => {
    renderPage({
      pathname: "/series/8",
      state: { returnTo: "/calendar?platform=instagram&view=week&date=2026-05-22" },
    });

    expect(await screen.findByRole("link", { name: "Back to calendar" })).toHaveAttribute(
      "href",
      "/calendar?platform=instagram&view=week&date=2026-05-22",
    );
  });

  it("opens on the first scheduled series post", async () => {
    seriesApi.get.mockResolvedValueOnce({
      id: 8,
      name: "Launch",
      platform: "instagram",
      starts_at: "2026-05-10T10:00:00",
      posts: [
        { ...seriesPost, id: 12, title: "July post", scheduled_at: "2026-07-15T09:00:00" },
        { ...seriesPost, id: 11, title: "June post", scheduled_at: "2026-06-05T09:00:00" },
      ],
    });
    postsApi.list.mockResolvedValueOnce([]);
    const { container } = renderPage();

    await screen.findAllByText("June post");

    expect(container.querySelector(".rbc-toolbar-label").textContent).toBe("June 2026");
  });

  it("opens the first-post form on the requested series start date", async () => {
    seriesApi.get.mockResolvedValueOnce({
      id: 8,
      name: "Launch",
      platform: "instagram",
      starts_at: "2026-06-10T10:00:00",
      posts: [],
    });
    postsApi.list.mockResolvedValueOnce([]);
    renderPage("/series/8?date=2026-06-10T10%3A00%3A00&newPost=1");

    expect(await screen.findByRole("heading", { name: "Add post" })).toBeInTheDocument();
    expect(screen.getByLabelText("Scheduled at")).toHaveValue("2026-06-10T10:00");
    expect(screen.queryByLabelText("Platform")).not.toBeInTheDocument();
  });

  it("jumps the calendar when a series post is selected from the list", async () => {
    seriesApi.get.mockResolvedValueOnce({
      id: 8,
      name: "Launch",
      platform: "instagram",
      starts_at: "2026-05-10T10:00:00",
      posts: [
        { ...seriesPost, id: 11, title: "June post", scheduled_at: "2026-06-05T09:00:00" },
        { ...seriesPost, id: 12, title: "July post", scheduled_at: "2026-07-15T09:00:00" },
      ],
    });
    postsApi.list.mockResolvedValueOnce([]);
    const { container } = renderPage();

    await screen.findAllByText("June post");
    expect(container.querySelector(".rbc-toolbar-label").textContent).toBe("June 2026");

    fireEvent.click(screen.getByRole("button", { name: /July post/ }));

    await waitFor(() => {
      expect(container.querySelector(".rbc-toolbar-label").textContent).toBe("July 2026");
    });
    expect(screen.getByRole("heading", { name: "Edit post" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("July post");
  });

  it("renders same-platform non-series posts as muted context events", async () => {
    const { container } = renderPage();

    await screen.findByText("Existing Instagram post");

    expect(postsApi.list).toHaveBeenCalledWith({ platform: "instagram" });
    expect(screen.queryByText("LinkedIn context post")).not.toBeInTheDocument();
    expect(screen.queryByText("Unscheduled Instagram draft")).not.toBeInTheDocument();
    expect(screen.getByText("Existing Instagram post").closest(".rbc-event")).toHaveClass(
      "related-platform-event",
    );
    expect(container.querySelector(".related-platform-event")).toBeInTheDocument();
  });

  it("opens and saves the selected series post in the editor panel", async () => {
    const updatedPost = {
      ...seriesPost,
      title: "Updated announcement",
      status: "published",
      series: {
        ...seriesPost.series,
        role_label: "Reminder",
      },
    };
    postsApi.update.mockResolvedValueOnce(updatedPost);
    renderPage();

    const eventTitle = await screen.findAllByText("Series announcement");
    fireEvent.click(eventTitle.find((node) => node.closest(".rbc-event")));

    expect(await screen.findByRole("heading", { name: "Edit post" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Series announcement");
    expect(screen.getByLabelText("Series role label")).toHaveValue("Announcement");

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Updated announcement" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "published" } });
    fireEvent.change(screen.getByLabelText("Series role label"), { target: { value: "Reminder" } });
    fireEvent.click(screen.getByRole("button", { name: "Save post" }));

    await waitFor(() => expect(postsApi.update).toHaveBeenCalled());
    expect(postsApi.update).toHaveBeenCalledWith(1, expect.objectContaining({
      title: "Updated announcement",
      status: "published",
      series_role_label: "Reminder",
    }));
    expect(await screen.findAllByText("Updated announcement")).not.toHaveLength(0);
  });

  it("does not edit same-platform context events", async () => {
    renderPage();

    const contextTitle = await screen.findByText("Existing Instagram post");
    fireEvent.click(contextTitle);

    expect(screen.queryByRole("heading", { name: "Edit post" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add to this series" })).toBeInTheDocument();
  });

  it("creates quick-add posts with the series platform", async () => {
    const { container } = renderPage();

    await screen.findAllByText("Series announcement");
    fireEvent.click(container.querySelector(".rbc-date-cell button"));

    expect(await screen.findByRole("heading", { name: "Add post" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Platform")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Quick post" } });
    fireEvent.click(screen.getByRole("button", { name: "Add post" }));

    await waitFor(() => expect(postsApi.create).toHaveBeenCalled());
    expect(postsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      title: "Quick post",
      platform: "instagram",
      series_id: 8,
    }));
  });
});
