import { artifactPathKey } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { insideFolder, live } from '../artifacts/path.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
} from '../postgres/schema.ts';
import { type ManagedSkill, skillFingerprint } from './release.ts';

export interface HeldFile {
    readonly artifact: typeof artifacts.$inferSelect;
    readonly sha256: string | null;
}

export async function readHeldSkill(tx: HausDatabase, serverId: string, root: string) {
    const rows = await tx
        .select({ artifact: artifacts, sha256: revisions.sha256 })
        .from(artifacts)
        .leftJoin(revisions, eq(revisions.id, artifacts.currentRevisionId))
        .where(and(live(serverId), insideFolder(root)));
    const prefix = artifactPathKey(root).length + 1;
    const files = new Map<string, HeldFile>(
        rows.map((row) => [row.artifact.pathKey.slice(prefix), row])
    );
    return { files, fingerprint: heldFingerprint(files) };
}

export function fingerprintAfterSeed(files: ReadonlyMap<string, HeldFile>, skill: ManagedSkill) {
    const after = new Map(
        [...files].flatMap(([path, file]) => (file.sha256 ? [[path, file.sha256] as const] : []))
    );
    for (const file of skill.files) {
        after.set(artifactPathKey(file.path), file.sha256);
    }
    return skillFingerprint([...after].map(([path, sha256]) => ({ path, sha256 })));
}

function heldFingerprint(files: ReadonlyMap<string, HeldFile>) {
    const present = [...files].flatMap(([path, file]) =>
        file.sha256 ? [{ path, sha256: file.sha256 }] : []
    );
    return present.length > 0 ? skillFingerprint(present) : null;
}
