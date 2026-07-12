import { db, schema } from "@server/db";
import { getActiveTenantId } from "@server/tenancy/context";
import { and, desc, eq } from "drizzle-orm";

const {
  applicationDossiers,
  applicationDraftRevisions,
  applicationApprovals,
  submittedApplicationArtifacts,
  jobPostingSnapshots,
} = schema;

export async function getDossierForJob(jobId: string) {
  const [row] = await db
    .select()
    .from(applicationDossiers)
    .where(
      and(
        eq(applicationDossiers.tenantId, getActiveTenantId()),
        eq(applicationDossiers.jobId, jobId),
      ),
    );
  return row ?? null;
}

export async function getDraftRevisionForJob(
  jobId: string,
  revisionId: string,
) {
  const [row] = await db
    .select()
    .from(applicationDraftRevisions)
    .where(
      and(
        eq(applicationDraftRevisions.tenantId, getActiveTenantId()),
        eq(applicationDraftRevisions.jobId, jobId),
        eq(applicationDraftRevisions.id, revisionId),
      ),
    );
  return row ?? null;
}

export async function getSubmittedArtifact(id: string) {
  const [row] = await db
    .select()
    .from(submittedApplicationArtifacts)
    .where(
      and(
        eq(submittedApplicationArtifacts.tenantId, getActiveTenantId()),
        eq(submittedApplicationArtifacts.id, id),
      ),
    );
  return row ?? null;
}

export async function getSubmittedArtifactForJob(jobId: string, id: string) {
  const [row] = await db
    .select()
    .from(submittedApplicationArtifacts)
    .where(
      and(
        eq(submittedApplicationArtifacts.tenantId, getActiveTenantId()),
        eq(submittedApplicationArtifacts.jobId, jobId),
        eq(submittedApplicationArtifacts.id, id),
      ),
    );
  return row ?? null;
}

export async function listApprovalsForDossier(dossierId: string) {
  return db
    .select()
    .from(applicationApprovals)
    .where(
      and(
        eq(applicationApprovals.tenantId, getActiveTenantId()),
        eq(applicationApprovals.dossierId, dossierId),
      ),
    )
    .orderBy(desc(applicationApprovals.createdAt));
}

export async function getJobPostingSnapshot(id: string) {
  const [row] = await db
    .select()
    .from(jobPostingSnapshots)
    .where(
      and(
        eq(jobPostingSnapshots.tenantId, getActiveTenantId()),
        eq(jobPostingSnapshots.id, id),
      ),
    );
  return row ?? null;
}
