import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CalendarPage from "./CalendarPage";
import { postsApi } from "../api/client";

vi.mock("../api/client", () => ({
  postsApi: { list: vi.fn() },
}));

describe("CalendarPage", () => {
  beforeEach(() => {
    postsApi.list.mockResolvedValue([
      {
        id: 1,
        title: "Launch teaser",
        status: "scheduled",
        platform: "instagram",
        scheduled_at: "2026-05-22T09:00:00Z",
        series: { id: 4, name: "Launch", role_label: "Teaser", offset_minutes: -1440 },
      },
      {
        id: 2,
        title: "Launch follow-up",
        status: "scheduled",
        platform: "linkedin",
        scheduled_at: "2026-05-23T09:00:00Z",
        series: { id: 4, name: "Launch", role_label: "Follow-up", offset_minutes: 0 },
      },
    ]);
  });

  it("highlights visible sibling events when a series post is hovered", async () => {
    const { container } = render(<CalendarPage />);

    fireEvent.mouseEnter(await screen.findByText("Launch teaser"));

    await waitFor(() => {
      expect(container.querySelectorAll(".series-related-event")).toHaveLength(2);
    });
  });

  it("keeps toolbar date navigation working", async () => {
    const { container } = render(<CalendarPage />);

    await screen.findByText("Launch teaser");
    const currentLabel = container.querySelector(".rbc-toolbar-label").textContent;
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(container.querySelector(".rbc-toolbar-label").textContent).not.toBe(currentLabel);
    });
  });
});
