import type {
  CareerPipelineProjection,
  CareerPipelineStage,
  JobListItem,
  StageEvent,
} from "@shared/types";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api";
import { renderWithQueryClient } from "../test/renderWithQueryClient";
import { InProgressBoardPage } from "./InProgressBoardPage";

vi.mock("@/components/ui/dropdown-menu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/dropdown-menu")>();

  return {
    ...actual,
    DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
    DropdownMenuTrigger: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
    DropdownMenuContent: ({ children }: { children: ReactNode }) => (
      <div role="menu">{children}</div>
    ),
    DropdownMenuItem: ({
      children,
      onSelect,
      disabled,
    }: {
      children: ReactNode;
      onSelect?: () => void;
      disabled?: boolean;
    }) => (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        onClick={onSelect}
      >
        {children}
      </button>
    ),
  };
});

const render = (ui: Parameters<typeof renderWithQueryClient>[0]) =>
  renderWithQueryClient(ui);

const getBoardCardRoot = (cardTitle: HTMLElement): HTMLElement => {
  const cardRoot = cardTitle.closest("div.rounded-lg");
  if (!cardRoot) {
    throw new Error("Board card root not found");
  }
  return cardRoot as HTMLElement;
};

vi.mock("../api", () => ({
  getJobs: vi.fn(),
  getCareerPipeline: vi.fn(),
  getJobStageEvents: vi.fn(),
  transitionJobStage: vi.fn(),
  updateJobStageEvent: vi.fn(),
  createJobNote: vi.fn(),
}));

vi.mock("canvas-confetti", () => ({
  default: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const makeJob = (overrides: Partial<JobListItem>): JobListItem => ({
  id: "job-1",
  source: "manual",
  sourceJobId: null,
  title: "Backend Engineer",
  employer: "Acme",
  jobUrl: "https://example.com/jobs/1",
  applicationLink: null,
  datePosted: null,
  deadline: null,
  salary: null,
  location: null,
  status: "in_progress",
  outcome: null,
  closedAt: null,
  suitabilityScore: null,
  sponsorMatchScore: null,
  appliedDuplicateMatch: null,
  jobType: null,
  jobFunction: null,
  pdfRegenerating: false,
  pdfFreshness: "missing",
  salaryMinAmount: null,
  salaryMaxAmount: null,
  salaryCurrency: null,
  followUpUrgency: "urgent",
  followUpReason: "Technical interview follow-up is due.",
  nextFollowUpAt: null,
  discoveredAt: "2026-01-01T00:00:00.000Z",
  readyAt: null,
  appliedAt: "2025-12-30T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

const makeEvent = (overrides: Partial<StageEvent>): StageEvent => ({
  id: "evt-1",
  applicationId: "job-1",
  title: "Recruiter Screen",
  groupId: null,
  fromStage: "applied",
  toStage: "recruiter_screen",
  occurredAt: 1_700_000_000,
  metadata: null,
  outcome: null,
  ...overrides,
});

const EMPTY_PIPELINE_STAGES: CareerPipelineStage[] = [
  "assessment",
  "hiring_manager_screen",
  "technical_interview",
  "onsite",
  "offer",
  "closed",
];

const makePipeline = (): CareerPipelineProjection => ({
  columns: [
    {
      stage: "recruiter_screen",
      label: "Recruiter Screen",
      cards: [
        {
          job: {
            id: "job-1",
            title: "Backend Engineer",
            employer: "Acme",
            outcome: null,
            appliedAt: "2025-12-30T00:00:00.000Z",
            discoveredAt: "2026-01-01T00:00:00.000Z",
            followUpUrgency: "urgent",
          },
          stage: "recruiter_screen",
          latestEvent: {
            id: "evt-1",
            title: "Recruiter Screen",
            toStage: "recruiter_screen",
            occurredAt: 1_700_000_000,
          },
          pendingTaskCount: 1,
          overdueTaskCount: 0,
          noteCount: 2,
          latestNoteAt: "2026-01-01T00:00:00.000Z",
          nextAction: {
            id: "task-1",
            title: "Send follow-up",
            dueDate: 1_700_010_000,
          },
          nextInterview: null,
          isStale: false,
          staleDays: 0,
          needsFollowUp: true,
        },
      ],
    },
    ...EMPTY_PIPELINE_STAGES.map((stage) => ({
      stage,
      label: stage,
      cards: [],
    })),
  ],
});

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(api.getJobs).mockResolvedValue({
    jobs: [makeJob({})],
    total: 1,
    byStatus: {
      discovered: 0,
      processing: 0,
      ready: 0,
      applied: 0,
      in_progress: 1,
      skipped: 0,
      expired: 0,
    },
    revision: "r1",
  } as Awaited<ReturnType<typeof api.getJobs>>);
  vi.mocked(api.getJobStageEvents).mockResolvedValue([makeEvent({})]);
  vi.mocked(api.getCareerPipeline).mockResolvedValue(makePipeline());
  vi.mocked(api.transitionJobStage).mockResolvedValue(
    makeEvent({ toStage: "offer", title: "Offer" }),
  );
  vi.mocked(api.createJobNote).mockResolvedValue({
    id: "note-1",
    jobId: "job-1",
    title: "Follow-up draft",
    content: "Draft body",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

describe("InProgressBoardPage", () => {
  it("loads the canonical career pipeline projection", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getCareerPipeline).toHaveBeenCalledWith();
    });
    expect(await screen.findByText("1 open task")).toBeInTheDocument();
    expect(screen.getByText("2 notes")).toBeInTheDocument();
    expect(
      screen.getByRole("combobox", { name: "Filter board by stage" }),
    ).toBeInTheDocument();
  });

  it("loads in-progress jobs and renders cards", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(api.getCareerPipeline).toHaveBeenCalledWith();
    });

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
  });

  it("shows cards when the projection has no latest event", async () => {
    const projection = makePipeline();
    projection.columns[0].cards[0].latestEvent = null;
    vi.mocked(api.getCareerPipeline).mockResolvedValue(projection);

    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Backend Engineer")).toBeInTheDocument();
  });

  it("transitions a job stage when dropped into another lane", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    const card = await screen.findByRole("link", { name: /Backend Engineer/i });
    const offerHeader = await screen.findByText("Offer");
    const offerLane = offerHeader.closest("section");

    if (!offerLane) {
      throw new Error("Offer lane section not found");
    }

    fireEvent.dragStart(card, {
      dataTransfer: {
        effectAllowed: "move",
      },
    });
    fireEvent.dragOver(offerLane);
    fireEvent.drop(offerLane);

    await waitFor(() => {
      expect(api.transitionJobStage).toHaveBeenCalledWith("job-1", {
        toStage: "offer",
        metadata: {
          actor: "user",
          eventType: "status_update",
          eventLabel: "Moved to Offer",
          reasonCode: "in_progress_board_drag",
        },
      });
    });
  });

  it("opens the log event modal from the card menu without navigating", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    const cardRoot = getBoardCardRoot(
      await screen.findByText("Backend Engineer"),
    );

    fireEvent.click(
      within(cardRoot).getByRole("menuitem", { name: /log event/i }),
    );

    expect(screen.getByTestId("log-event-modal")).toBeInTheDocument();
    expect(
      screen.getByText(
        /record a new update or stage change for backend engineer at acme/i,
      ),
    ).toBeInTheDocument();
  });

  it("logs an event from the board menu", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    const cardRoot = getBoardCardRoot(
      await screen.findByText("Backend Engineer"),
    );

    fireEvent.click(
      within(cardRoot).getByRole("menuitem", { name: /log event/i }),
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. Recruiter Screen"), {
      target: { value: "Phone screen" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^log event$/i }));

    await waitFor(() => {
      expect(api.transitionJobStage).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          metadata: expect.objectContaining({
            eventLabel: "Phone screen",
            actor: "user",
          }),
        }),
      );
    });

    expect(toast.success).toHaveBeenCalledWith("Event logged");
  });

  it("surfaces load errors", async () => {
    vi.mocked(api.getCareerPipeline).mockRejectedValue(
      new Error("Failed to load board"),
    );

    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Failed to load board");
    });
    expect(
      screen.getByRole("alert", { name: /unable to load/i }),
    ).toBeInTheDocument();
  });

  it("shows an accessible empty state for an empty projection", async () => {
    const projection = makePipeline();
    for (const column of projection.columns) column.cards = [];
    vi.mocked(api.getCareerPipeline).mockResolvedValue(projection);

    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("status", { name: /no applications/i }),
    ).toBeInTheDocument();
  });

  it("renders follow-up urgency and saves a follow-up draft from the card", async () => {
    render(
      <MemoryRouter>
        <InProgressBoardPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("Urgent reply")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /create follow-up draft for backend engineer/i,
      }),
    );

    await waitFor(() => {
      expect(api.createJobNote).toHaveBeenCalledWith(
        "job-1",
        expect.objectContaining({
          title: expect.stringContaining("Follow-up draft"),
          content: expect.stringContaining("Acme"),
        }),
      );
    });
  });
});
