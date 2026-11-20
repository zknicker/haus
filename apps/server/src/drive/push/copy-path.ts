import { artifactConflictCopyPath, artifactPathSchema } from '@haus/api';
import { liveArtifactAtPath, placeArtifactPath } from '../../artifacts/path.ts';
import { ArtifactError } from '../../artifacts/storage.ts';
import type { HausDatabase } from '../../postgres/connection.ts';

export async function freeCopyPath(
    tx: HausDatabase,
    serverId: string,
    path: string,
    handle: string
) {
    for (let n = 1; ; n += 1) {
        const candidate = copyPathWithinRules(path, artifactConflictCopyPath(path, handle, n));
        if (
            !(await liveArtifactAtPath(tx, serverId, candidate)) &&
            (await placeable(tx, serverId, candidate))
        ) {
            return candidate;
        }
    }
}

function copyPathWithinRules(path: string, copy: string) {
    const parsed = artifactPathSchema.safeParse(copy);
    if (parsed.success) {
        return parsed.data;
    }
    throw new ArtifactError(
        `\`${path}\` has no room for a conflict copy beside it: ${parsed.error.issues[0]?.message ?? 'the copy breaks the path rules.'}`,
        400,
        'INVALID_PATH'
    );
}

async function placeable(tx: HausDatabase, serverId: string, path: string) {
    try {
        await placeArtifactPath(tx, serverId, path);
        return true;
    } catch (cause) {
        if (cause instanceof ArtifactError && cause.code === 'PATH_CONFLICT') {
            return false;
        }
        throw cause;
    }
}
