import { artifactPathBasename, artifactPathSchema } from '@haus/api';
import { liveArtifactAtPath, placeArtifactPath } from '../../artifacts/path.ts';
import { ArtifactError } from '../../artifacts/storage.ts';
import type { HausDatabase } from '../../postgres/connection.ts';

export function conflictCopyPath(path: string, handle: string, n: number) {
    const name = artifactPathBasename(path);
    const folder = path.slice(0, path.length - name.length);
    const dot = name.lastIndexOf('.');
    const [stem, extension] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
    return `${folder}${stem}.conflict-${handle}${n > 1 ? `-${n}` : ''}${extension}`;
}

export async function freeCopyPath(
    tx: HausDatabase,
    serverId: string,
    path: string,
    handle: string
) {
    for (let n = 1; ; n += 1) {
        const candidate = artifactPathSchema.parse(conflictCopyPath(path, handle, n));
        if (
            !(await liveArtifactAtPath(tx, serverId, candidate)) &&
            (await placeable(tx, serverId, candidate))
        ) {
            return candidate;
        }
    }
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
