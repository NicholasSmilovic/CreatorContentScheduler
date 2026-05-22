import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostEdit from "./PostEdit";
import { postsApi, seriesApi } from "../api/client";

vi.mock("../api/client", () => ({
  postsApi: { get: vi.fn(), create: vi.fn(), update: vi.fn() },
  seriesApi: { list: vi.fn() },
}));

describe("PostEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seriesApi.list.mockResolvedValue([{ id: 9, name: "Launch", platform: "linkedin" }]);
    postsApi.get.mockResolvedValue({
      id: 2,
      title: "Reminder",
      platform: "linkedin",
      status: "scheduled",
      scheduled_at: "2026-06-17T10:00:00Z",
      series: {
        id: 9,
        name: "Launch",
        platform: "linkedin",
        role_label: "Reminder",
        offset_minutes: 10080,
      },
    });
  });

  it("loads series membership controls for an existing post", async () => {
    render(
      <MemoryRouter initialEntries={["/posts/2/edit"]}>
        <Routes>
          <Route path="/posts/:id/edit" element={<PostEdit />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByPlaceholderText("Post title")).toHaveValue("Reminder");
    expect(screen.getByRole("option", { name: "Launch (linkedin)" }).selected).toBe(true);
    const platformSelect = screen.getByRole("combobox", { name: /Platform/ });
    expect(platformSelect).toBeDisabled();
    expect(platformSelect).toHaveValue("linkedin");
  });

  it("creates a new series post with the selected series platform", async () => {
    postsApi.create.mockResolvedValue({ id: 20 });
    render(
      <MemoryRouter initialEntries={["/posts/new"]}>
        <Routes>
          <Route path="/posts/new" element={<PostEdit />} />
          <Route path="/posts/:id/edit" element={<div>Created post</div>} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByRole("option", { name: "Launch (linkedin)" });
    fireEvent.change(screen.getByPlaceholderText("Post title"), { target: { value: "Series post" } });
    fireEvent.change(screen.getByLabelText("Scheduled at (optional)"), {
      target: { value: "2026-06-17T10:00" },
    });
    fireEvent.change(screen.getByLabelText("Content series"), { target: { value: "9" } });

    expect(screen.getByRole("combobox", { name: /Platform/ })).toHaveValue("linkedin");
    expect(screen.getByRole("combobox", { name: /Platform/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(postsApi.create).toHaveBeenCalled());
    expect(postsApi.create).toHaveBeenCalledWith(expect.objectContaining({
      title: "Series post",
      platform: "linkedin",
      scheduled_at: "2026-06-17T10:00",
      series_id: 9,
    }));
    expect(await screen.findByText("Created post")).toBeInTheDocument();
  });
});
