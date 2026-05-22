import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import PostsList from "./PostsList";
import { postsApi } from "../api/client";

vi.mock("../api/client", () => ({
  postsApi: { list: vi.fn() },
}));

describe("PostsList", () => {
  beforeEach(() => {
    postsApi.list.mockResolvedValue([
      {
        id: 7,
        title: "Launch teaser",
        platform: "instagram",
        status: "scheduled",
        scheduled_at: "2026-06-03T10:00:00Z",
        series: { id: 3, name: "Launch", role_label: "Teaser", offset_minutes: -10080 },
      },
    ]);
  });

  it("links series creation and attached series calendars", async () => {
    render(<PostsList />, { wrapper: MemoryRouter });

    expect(await screen.findByRole("link", { name: "New Series" })).toHaveAttribute(
      "href",
      "/series/new",
    );
    expect(await screen.findByRole("link", { name: "Launch" })).toHaveAttribute(
      "href",
      "/series/3",
    );
  });
});
