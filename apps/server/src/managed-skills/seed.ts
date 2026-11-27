import { artifactPathBasename, artifactPathKey } from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { advanceHead, markUploaded } from '../artifacts/land.ts';
import { lockLiveServer } from '../artifacts/move.ts';
import { abandonUpload } from '../artifacts/publish.ts';
import { hausAuthorKey } from '../artifacts/read.ts';
import { insertUploadingRevision } from '../artifacts/reserve.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { createArtifactAt } from '../artifacts/write-target.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    artifactsTable as artifacts,
    type artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { fingerprintAfterSeed, readHeldSkill } from './held-skill.ts';
import { type AgentRef, readSkillRecord, type SkillRecord, writeSkillRecord } from './record.ts';
import {
    factoryRelease,
    type ManagedSkill,
    type ManagedSkillFile,
    type ManagedSkillRelease,
} from './release.ts';

export type SkillSeedOutcome = 'current' | 'edited' | 'raced' | 'retired' | 'updated' | 'written';

export async function seedManagedSkills(
    db: HausDatabase,
    storage: ArtifactStorage,
    agent: AgentRef,
    release: ManagedSkillRelease = factoryRelease
) {
    const outcomes: Record<string, SkillSeedOutcome> = {};
    for (const skill of release) {
        outcomes[skill.id] = await seedSkill(db, storage, agent, skill);
    }
    return outcomes;
}

export function seedStep(held: string | null, release: string, seeded: string | undefined) {
    if (held === null) {
        return 'write';
    }
    if (held === release) {
        return 'current';
    }
    return held === seeded ? 'update' : 'edited';
}

interface PlannedWrite {
    readonly artifactId: string;
    readonly base: string | null;
    readonly file: ManagedSkillFile;
    readonly pathKey: string;
    readonly revision: typeof revisions.$inferSelect;
}

type SkillPlan =
    | { readonly kind: 'settled'; readonly outcome: SkillSeedOutcome }
    | {
          readonly heldFingerprint: string | null;
          readonly kind: 'upload';
          readonly outcome: 'updated' | 'written';
          readonly record: SkillRecord;
          readonly root: string;
          readonly writes: readonly PlannedWrite[];
      };

async function seedSkill(
    db: HausDatabase,
    storage: ArtifactStorage,
    agent: AgentRef,
    skill: ManagedSkill
) {
    const plan = await db.transaction((tx) => planSkill(tx, agent, skill));
    if (plan.kind === 'settled') {
        return plan.outcome;
    }
    const uploaded: { sha256: string; size: number }[] = [];
    try {
        for (const write of plan.writes) {
            uploaded.push(
                await storage.upload(
                    write.revision.objectKey,
                    chunksOf(write.file.bytes),
                    write.file.contentType
                )
            );
        }
    } catch (cause) {
        await abandon(db, storage, plan.writes, cause);
        throw cause;
    }
    const landed = await db.transaction((tx) => landSkill(tx, agent, skill, plan, uploaded));
    if (!landed) {
        await abandon(db, storage, plan.writes, null);
        return 'raced';
    }
    for (const write of plan.writes) {
        artifactUpdatedTopic.announce({ artifactId: write.artifactId, serverId: agent.serverId });
    }
    return plan.outcome;
}

async function planSkill(tx: HausDatabase, agent: AgentRef, skill: ManagedSkill) {
    await lockLiveServer(tx, agent.serverId);
    const [owner] = await tx
        .select({ handle: agentsTable.handle })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, agent.serverId),
                eq(agentsTable.id, agent.agentId),
                isNull(agentsTable.retiredAt),
                eq(agentsTable.kind, 'captain')
            )
        )
        .limit(1);
    if (!owner) {
        return settled('retired');
    }
    const root = `agents/${owner.handle}/skills/${skill.id}`;
    const held = await readHeldSkill(tx, agent.serverId, root);
    const prior = await readSkillRecord(tx, agent, skill.id);
    const pending = prior?.pendingReleaseFingerprint ?? null;
    const step = seedStep(held.fingerprint, skill.fingerprint, prior?.seededFingerprint);
    const stale = skill.files.filter(
        (file) => held.files.get(artifactPathKey(file.path))?.sha256 !== file.sha256
    );
    if (step === 'edited') {
        await writeSkillRecord(tx, agent, skill.id, {
            pending,
            release: skill.fingerprint,
            seeded: prior?.seededFingerprint ?? skill.fingerprint,
        });
        return settled('edited');
    }
    const seeded = fingerprintAfterSeed(held.files, skill);
    if (stale.length === 0) {
        await writeSkillRecord(tx, agent, skill.id, {
            pending,
            release: skill.fingerprint,
            seeded,
        });
        return settled('current');
    }
    const writes: PlannedWrite[] = [];
    for (const file of stale) {
        const artifact =
            held.files.get(artifactPathKey(file.path))?.artifact ??
            (await createArtifactAt(
                tx,
                { agentId: agent.agentId, serverId: agent.serverId, userId: null },
                `${root}/${file.path}`
            ));
        const revision = await insertUploadingRevision(
            tx,
            {
                agentId: null,
                authorKey: hausAuthorKey,
                serverId: agent.serverId,
                userId: null,
            },
            {
                artifact,
                base: artifact.currentRevisionId,
                contentType: file.contentType,
                path: artifact.path,
                requestId: createOpaqueId('seed'),
                reservedBytes: file.bytes.byteLength,
                taskId: null,
                title: artifactPathBasename(artifact.path),
            }
        );
        writes.push({
            artifactId: artifact.id,
            base: artifact.currentRevisionId,
            file,
            pathKey: artifact.pathKey,
            revision,
        });
    }
    const plan: SkillPlan = {
        heldFingerprint: held.fingerprint,
        kind: 'upload',
        outcome: step === 'write' ? 'written' : 'updated',
        record: {
            pending: step === 'update' ? skill.fingerprint : pending,
            release: skill.fingerprint,
            seeded,
        },
        root,
        writes,
    };
    return plan;
}

async function landSkill(
    tx: HausDatabase,
    agent: AgentRef,
    skill: ManagedSkill,
    plan: Extract<SkillPlan, { kind: 'upload' }>,
    uploaded: readonly { sha256: string; size: number }[]
) {
    await lockLiveServer(tx, agent.serverId);
    const held = await readHeldSkill(tx, agent.serverId, plan.root);
    if (held.fingerprint !== plan.heldFingerprint) {
        return false;
    }
    const rows = await tx
        .select()
        .from(artifacts)
        .where(
            inArray(
                artifacts.id,
                plan.writes.map((write) => write.artifactId)
            )
        );
    const byId = new Map(rows.map((row) => [row.id, row]));
    const ready = plan.writes.flatMap((write, index) => {
        const artifact = byId.get(write.artifactId);
        const bytes = uploaded[index];
        return artifact &&
            bytes &&
            !artifact.deletedAt &&
            artifact.pathKey === write.pathKey &&
            artifact.currentRevisionId === write.base
            ? [{ artifact, bytes, write }]
            : [];
    });
    if (ready.length !== plan.writes.length) {
        return false;
    }
    for (const { artifact, bytes, write } of ready) {
        const landed = await markUploaded(tx, artifact, write.revision, bytes);
        await advanceHead(tx, agent.serverId, artifact, landed);
    }
    await writeSkillRecord(tx, agent, skill.id, plan.record);
    return true;
}

async function abandon(
    db: HausDatabase,
    storage: ArtifactStorage,
    writes: readonly PlannedWrite[],
    cause: unknown
) {
    for (const write of writes) {
        await abandonUpload(db, storage, write.revision, cause);
    }
}

function settled(outcome: SkillSeedOutcome) {
    const plan: SkillPlan = { kind: 'settled', outcome };
    return plan;
}

async function* chunksOf(bytes: Uint8Array) {
    yield bytes;
}
