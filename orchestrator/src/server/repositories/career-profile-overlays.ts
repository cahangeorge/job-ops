import { conflict, notFound } from "@infra/errors";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { getActiveTenantId } from "../tenancy/context";

export type CareerProfileOverlaySection = Record<string, unknown>;

export type CareerProfileOverlay = {
  preferences: CareerProfileOverlaySection;
  targets: CareerProfileOverlaySection;
  constraints: CareerProfileOverlaySection;
  provenance: CareerProfileOverlaySection;
  createdAt: string;
  updatedAt: string;
};

export type UpdateCareerProfileOverlayInput = {
  expectedUpdatedAt: string | null;
  preferences?: CareerProfileOverlaySection;
  targets?: CareerProfileOverlaySection;
  constraints?: CareerProfileOverlaySection;
  provenance?: CareerProfileOverlaySection;
};

const { careerProfileOverlays } = schema;

function parseSection(value: string): CareerProfileOverlaySection {
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as CareerProfileOverlaySection)
      : {};
  } catch {
    return {};
  }
}

function mapOverlay(
  row: typeof careerProfileOverlays.$inferSelect,
): CareerProfileOverlay {
  return {
    preferences: parseSection(row.preferences),
    targets: parseSection(row.targets),
    constraints: parseSection(row.constraints),
    provenance: parseSection(row.provenance),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function getNextUpdatedAt(updatedAt: string): string {
  const prior = Date.parse(updatedAt);
  return new Date(
    Math.max(Date.now(), Number.isNaN(prior) ? 0 : prior + 1),
  ).toISOString();
}

export async function getCareerProfileOverlay(): Promise<CareerProfileOverlay | null> {
  const tenantId = getActiveTenantId();
  const row = await db
    .select()
    .from(careerProfileOverlays)
    .where(eq(careerProfileOverlays.tenantId, tenantId))
    .limit(1)
    .get();
  return row ? mapOverlay(row) : null;
}

export async function updateCareerProfileOverlay(
  input: UpdateCareerProfileOverlayInput,
): Promise<CareerProfileOverlay> {
  const tenantId = getActiveTenantId();
  const existing = await getCareerProfileOverlay();

  if (!existing) {
    if (input.expectedUpdatedAt !== null) {
      throw notFound("Career profile overlay not found");
    }
    const now = new Date().toISOString();
    await db.insert(careerProfileOverlays).values({
      tenantId,
      preferences: JSON.stringify(input.preferences ?? {}),
      targets: JSON.stringify(input.targets ?? {}),
      constraints: JSON.stringify(input.constraints ?? {}),
      provenance: JSON.stringify(input.provenance ?? {}),
      createdAt: now,
      updatedAt: now,
    });
    const created = await getCareerProfileOverlay();
    if (!created) throw new Error("Failed to create career profile overlay");
    return created;
  }

  if (input.expectedUpdatedAt !== existing.updatedAt) {
    throw conflict("Career profile overlay was updated elsewhere");
  }

  const updatedAt = getNextUpdatedAt(existing.updatedAt);
  const result = await db
    .update(careerProfileOverlays)
    .set({
      preferences: JSON.stringify(input.preferences ?? existing.preferences),
      targets: JSON.stringify(input.targets ?? existing.targets),
      constraints: JSON.stringify(input.constraints ?? existing.constraints),
      provenance: JSON.stringify(input.provenance ?? existing.provenance),
      updatedAt,
    })
    .where(
      and(
        eq(careerProfileOverlays.tenantId, tenantId),
        eq(careerProfileOverlays.updatedAt, input.expectedUpdatedAt),
      ),
    )
    .returning();

  if (result.length === 0) {
    throw conflict("Career profile overlay was updated elsewhere");
  }
  return mapOverlay(result[0]);
}

export async function deleteCareerProfileOverlay(
  expectedUpdatedAt: string,
): Promise<void> {
  const tenantId = getActiveTenantId();
  const deleted = await db
    .delete(careerProfileOverlays)
    .where(
      and(
        eq(careerProfileOverlays.tenantId, tenantId),
        eq(careerProfileOverlays.updatedAt, expectedUpdatedAt),
      ),
    )
    .returning({ tenantId: careerProfileOverlays.tenantId });

  if (deleted.length > 0) return;
  if (await getCareerProfileOverlay()) {
    throw conflict("Career profile overlay was updated elsewhere");
  }
  throw notFound("Career profile overlay not found");
}
