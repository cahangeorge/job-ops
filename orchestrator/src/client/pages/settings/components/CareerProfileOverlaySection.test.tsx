import * as api from "@client/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { CareerProfileOverlaySection } from "./CareerProfileOverlaySection";

vi.mock("@client/api", () => ({
  getCareerProfileOverlay: vi.fn(),
  updateCareerProfileOverlay: vi.fn(),
  resetCareerProfileOverlay: vi.fn(),
}));

describe("CareerProfileOverlaySection", () => {
  it("edits the tenant overlay without presenting canonical resume fields", async () => {
    vi.mocked(api.getCareerProfileOverlay).mockResolvedValue(null);
    vi.mocked(api.updateCareerProfileOverlay).mockResolvedValue({
      preferences: { roles: ["Platform Engineer"] },
      targets: { companies: ["Acme"] },
      constraints: {},
      provenance: { source: "manual" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <CareerProfileOverlaySection layoutMode="panel" />
      </QueryClientProvider>,
    );

    const roles = await screen.findByLabelText("Preferred roles");
    fireEvent.change(roles, { target: { value: "Platform Engineer" } });
    fireEvent.change(screen.getByLabelText("Target companies"), {
      target: { value: "Acme" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save career preferences" }),
    );

    await waitFor(() =>
      expect(api.updateCareerProfileOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedUpdatedAt: null,
          preferences: expect.objectContaining({
            roles: ["Platform Engineer"],
          }),
          targets: expect.objectContaining({ companies: ["Acme"] }),
          provenance: { source: "manual" },
        }),
        expect.anything(),
      ),
    );
    expect(
      screen.getByText(/never edit your source profile or resume/i),
    ).toBeInTheDocument();
  });

  it("preserves imported and API-only overlay values when saving a visible field", async () => {
    vi.mocked(api.updateCareerProfileOverlay).mockClear();
    vi.mocked(api.getCareerProfileOverlay).mockResolvedValue({
      preferences: {
        roles: ["Platform Engineer"],
        locations: ["Berlin"],
        workModes: ["remote"],
        employmentTypes: ["permanent"],
      },
      targets: {
        companies: ["Acme"],
        industries: ["Software"],
        keywords: ["TypeScript"],
      },
      constraints: { requiresVisaSponsorship: false },
      provenance: { source: "imported", note: "Imported from CV" },
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    vi.mocked(api.updateCareerProfileOverlay).mockResolvedValue({
      preferences: {},
      targets: {},
      constraints: {},
      provenance: {},
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:01.000Z",
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <CareerProfileOverlaySection layoutMode="panel" />
      </QueryClientProvider>,
    );

    const roles = await screen.findByDisplayValue("Platform Engineer");
    fireEvent.change(roles, {
      target: { value: "Staff Platform Engineer" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save career preferences" }),
    );

    await waitFor(() =>
      expect(api.updateCareerProfileOverlay).toHaveBeenCalledWith(
        expect.objectContaining({
          preferences: {
            roles: ["Staff Platform Engineer"],
            locations: ["Berlin"],
            workModes: ["remote"],
            employmentTypes: ["permanent"],
          },
          targets: {
            companies: ["Acme"],
            industries: ["Software"],
            keywords: ["TypeScript"],
          },
          provenance: { source: "imported", note: "Imported from CV" },
        }),
        expect.anything(),
      ),
    );
  });
});
