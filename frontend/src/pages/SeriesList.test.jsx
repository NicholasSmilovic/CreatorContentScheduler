import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeriesList from "./SeriesList";
import { seriesApi } from "../api/client";

vi.mock("../api/client", () => ({
  seriesApi: { list: vi.fn() },
}));

describe("SeriesList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("links series even when they do not have posts", async () => {
    seriesApi.list.mockResolvedValue([
      {
        id: 42,
        name: "Empty launch series",
        platform: "instagram",
        starts_at: "2026-06-10T10:00:00",
      },
    ]);

    render(<SeriesList />, { wrapper: MemoryRouter });

    expect(await screen.findByRole("link", { name: "Empty launch series" })).toHaveAttribute(
      "href",
      "/series/42",
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute("href", "/series/42");
    expect(screen.getByRole("link", { name: "New Series" })).toHaveAttribute("href", "/series/new");
  });

  it("links to series creation when the list is empty", async () => {
    seriesApi.list.mockResolvedValue([]);

    render(<SeriesList />, { wrapper: MemoryRouter });

    expect(await screen.findByRole("cell", { name: /No series yet/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Create one" })).toHaveAttribute("href", "/series/new");
  });
});
