import { beforeEach, describe, expect, it, vi } from "vitest";

const listOutcomeLearningRecordsMock = vi.hoisted(() => vi.fn());
const aggregateOutcomeLearningMock = vi.hoisted(() => vi.fn());

vi.mock("@server/repositories/competency-evidence", () => ({
  listOutcomeLearningRecords: listOutcomeLearningRecordsMock,
}));
vi.mock("@server/services/outcome-learning", () => ({
  aggregateOutcomeLearning: aggregateOutcomeLearningMock,
}));

import { outcomeLearningRouter } from "./outcome-learning";

function response() {
  return {
    body: null as unknown,
    headers: {} as Record<string, string>,
    statusCode: 200,
    getHeader(name: string) {
      return this.headers[name.toLowerCase()];
    },
    setHeader(name: string, value: string) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe("outcome learning API route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns tenant-scoped descriptive report with provenance but no raw source blobs", async () => {
    listOutcomeLearningRecordsMock.mockResolvedValue([
      { tenantId: "tenant_default", competencyId: "competency-1" },
    ]);
    aggregateOutcomeLearningMock.mockReturnValue({
      smallSampleThreshold: 5,
      competencies: [
        {
          competencyId: "competency-1",
          competencyName: "Communication",
          sampleSize: 1,
          observations: [
            {
              stage: "interview",
              outcome: "rejected",
              numerator: 1,
              denominator: 1,
              observation: "insufficient_sample",
            },
          ],
          evidenceSources: [
            {
              sourceType: "dossier_revision",
              sourceId: "revision-1",
              sourceVersion: "",
              sourceRevision: "2",
              extractionMethod: "manual",
              confidence: 0.7,
              evidenceHash: "a".repeat(64),
            },
          ],
        },
      ],
    });
    const layer = (outcomeLearningRouter.stack as Array<any>).find(
      (entry: any) => entry.route?.path === "/" && entry.route.methods?.get,
    );
    const res = response();
    await layer.route.stack[0].handle({} as never, res as never, vi.fn());

    expect(listOutcomeLearningRecordsMock).toHaveBeenCalledOnce();
    expect(aggregateOutcomeLearningMock).toHaveBeenCalledWith({
      tenantId: "tenant_default",
      records: [{ tenantId: "tenant_default", competencyId: "competency-1" }],
    });
    expect(res.body).toMatchObject({
      ok: true,
      data: {
        competencies: [
          {
            evidenceSources: [
              {
                sourceType: "dossier_revision",
                sourceId: "revision-1",
                sourceRevision: "2",
              },
            ],
          },
        ],
      },
    });
    expect(JSON.stringify(res.body)).not.toContain("evidenceExcerpt");
    expect(JSON.stringify(res.body)).not.toContain("contentSnapshot");
  });

  it("forwards rejected repository work to normal API error handling", async () => {
    const rejection = new Error("outcome learning storage unavailable");
    listOutcomeLearningRecordsMock.mockRejectedValue(rejection);
    const layer = (outcomeLearningRouter.stack as Array<any>).find(
      (entry: any) => entry.route?.path === "/" && entry.route.methods?.get,
    );
    const next = vi.fn();

    expect(
      layer.route.stack[0].handle({} as never, response() as never, next),
    ).toBeUndefined();

    await vi.waitFor(() => expect(next).toHaveBeenCalledWith(rejection));
  });
});
