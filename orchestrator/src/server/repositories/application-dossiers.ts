import { db, schema } from "@server/db";
import { getActiveTenantId } from "@server/tenancy/context";
import { and, desc, eq } from "drizzle-orm";

const {
  applicationDossiers,
  applicationDraftRevisions,
  jobPostingSnapshots,
  submittedApplicationArtifacts,
} = schema;

export async function getApplicationDossierForJob(jobId: string) {
  const [dossier] = await db
    .select()
    .from(applicationDossiers)
    .where(
      and(
        eq(applicationDossiers.tenantId, getActiveTenantId()),
        eq(applicationDossiers.jobId, jobId),
      ),
    )
    .limit(1);
  return dossier ?? null;
}

export async function getJobPostingSnapshotByHash(jobId: string, hash: string) {
  const [snapshot] = await db
    .select()
    .from(jobPostingSnapshots)
    .where(
      and(
        eq(jobPostingSnapshots.tenantId, getActiveTenantId()),
        eq(jobPostingSnapshots.jobId, jobId),
        eq(jobPostingSnapshots.contentHash, hash),
      ),
    )
    .limit(1);
  return snapshot ?? null;
}

export async function listApplicationDraftRevisionsForJob(
  jobId: string,
  maxResults = 21,
) {
  return db
    .select()
    .from(applicationDraftRevisions)
    .where(
      and(
        eq(applicationDraftRevisions.tenantId, getActiveTenantId()),
        eq(applicationDraftRevisions.jobId, jobId),
      ),
    )
    .orderBy(desc(applicationDraftRevisions.revisionNumber))
    .limit(maxResults);
}

export async function listSubmittedApplicationArtifactsForJob(
  jobId: string,
  maxResults = 21,
) {
  return db
    .select()
    .from(submittedApplicationArtifacts)
    .where(
      and(
        eq(submittedApplicationArtifacts.tenantId, getActiveTenantId()),
        eq(submittedApplicationArtifacts.jobId, jobId),
      ),
    )
    .orderBy(desc(submittedApplicationArtifacts.createdAt))
    .limit(maxResults);
}
