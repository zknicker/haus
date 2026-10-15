import {
    type ArtifactMoveManyInput,
    type ArtifactMoveManyResult,
    artifactPathBasename,
    artifactPathIsInside,
    artifactPathKey,
    artifactPathParent,
    parseArtifactPath,
} from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactUpdatedTopic } from '../realtime/topics.ts';
import { type ArtifactActor, artifactAccess } from './access.ts';
import { lockLiveServer, moveFile, moveFolder } from './move.ts';
import { liveArtifactAtPath } from './path.ts';
import { ArtifactError } from './storage.ts';

type MoveItem = ArtifactMoveManyInput['items'][number];

/**
 * Moves a selection into one folder in a single transaction, keeping each item's name: every
 * item moves or none does, under the same rules as `artifact.move` for each. Items already in
 * the folder stay put, and an item inside another selected folder travels with that folder.
 * Announces one Files update for the whole batch.
 */
export async function moveManyArtifacts(
    db: HausDatabase,
    actor: ArtifactActor,
    origin: string,
    input: Omit<ArtifactMoveManyInput, 'serverId'>
): Promise<ArtifactMoveManyResult> {
    const access = await artifactAccess(db, actor);
    const items = outermostItems(input.items);
    requireDistinctNames(items, input.to_folder);
    const result = await db.transaction(async (tx) => {
        await lockLiveServer(tx, access.serverId);
        const moved: ArtifactMoveManyResult['items'] = [];
        let count = 0;
        for (const item of items) {
            const to = destination(item.path, input.to_folder);
            const file = await liveArtifactAtPath(tx, access.serverId, item.path);
            if (
                artifactPathKey(artifactPathParent(item.path)) === artifactPathKey(input.to_folder)
            ) {
                moved.push({ from: item.path, kind: file ? 'file' : 'folder', to: item.path });
                continue;
            }
            const step = file
                ? await moveFile(tx, access, origin, file, { ...item, from: item.path, to })
                : await moveFolder(tx, access, { ...item, from: item.path, to });
            count += step.moved_count;
            moved.push({ from: step.from, kind: step.kind, to: step.to });
        }
        return { items: moved, moved_count: count };
    });
    if (result.moved_count > 0) {
        artifactUpdatedTopic.announce({ artifactId: null, serverId: access.serverId });
    }
    return result;
}

/** Drops items that sit inside another selected folder: moving the folder carries them. */
function outermostItems(items: readonly MoveItem[]): MoveItem[] {
    return items.filter(
        (item, index) =>
            !items.some(
                (other, otherIndex) =>
                    otherIndex !== index &&
                    (artifactPathIsInside(item.path, other.path) ||
                        (artifactPathKey(item.path) === artifactPathKey(other.path) &&
                            otherIndex < index))
            )
    );
}

/** Two items with one name cannot land in one folder. */
function requireDistinctNames(items: readonly MoveItem[], folder: string) {
    const seen = new Set<string>();
    for (const item of items) {
        const key = artifactPathKey(artifactPathBasename(item.path));
        if (seen.has(key)) {
            throw new ArtifactError(
                `Two selected items are named \`${artifactPathBasename(item.path)}\`; ${folder ? `\`${folder}\`` : 'Files'} can hold only one.`,
                409,
                'PATH_TAKEN'
            );
        }
        seen.add(key);
    }
}

function destination(path: string, folder: string): string {
    const name = artifactPathBasename(path);
    const parsed = parseArtifactPath(folder ? `${folder}/${name}` : name);
    if (!parsed.ok) {
        throw new ArtifactError(parsed.message, 400, 'INVALID_PATH');
    }
    return parsed.path;
}
