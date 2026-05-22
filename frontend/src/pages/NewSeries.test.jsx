import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NewSeries from "./NewSeries";
import { seriesApi } from "../api/client";

vi.mock("../api/client", () => ({
  seriesApi: { create: vi.fn() },
}));

function LocationProbe() {
  const location = useLocation();
  return <div>{location.pathname}{location.search}</div>;
}

describe("NewSeries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seriesApi.create.mockResolvedValue({
      id: 12,
      name: "Launch",
      platform: "instagram",
      starts_at: "2026-06-10T14:00:00.000Z",
    });
  });

  it("creates a series before navigating to its editor", async () => {
    render(
      <MemoryRouter initialEntries={["/series/new"]}>
        <Routes>
          <Route path="/series/new" element={<NewSeries />} />
          <Route path="/series/:id" element={<><div>Series editor</div><LocationProbe /></>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText("Series name"), { target: { value: "Launch" } });
    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "linkedin" } });
    fireEvent.click(screen.getByRole("button", { name: "Create series" }));

    await waitFor(() => expect(seriesApi.create).toHaveBeenCalled());
    expect(seriesApi.create).toHaveBeenCalledWith(expect.objectContaining({
      name: "Launch",
      platform: "linkedin",
    }));
    expect(await screen.findByText("Series editor")).toBeInTheDocument();
    expect(screen.getByText(/\/series\/12\?date=/)).toBeInTheDocument();
    expect(screen.getByText(/newPost=1/)).toBeInTheDocument();
  });

  it("starts without a platform and highlights missing required fields", async () => {
    render(
      <MemoryRouter initialEntries={["/series/new"]}>
        <Routes>
          <Route path="/series/new" element={<NewSeries />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("Platform")).toHaveValue("");

    fireEvent.click(screen.getByRole("button", { name: "Create series" }));

    expect(await screen.findByText("Fill out the highlighted fields.")).toBeInTheDocument();
    expect(screen.getByText("Enter a series name.")).toBeInTheDocument();
    expect(screen.getByText("Choose a platform for this series.")).toBeInTheDocument();
    expect(screen.getByLabelText("Series name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Platform")).toHaveAttribute("aria-invalid", "true");
    expect(seriesApi.create).not.toHaveBeenCalled();
  });
});
