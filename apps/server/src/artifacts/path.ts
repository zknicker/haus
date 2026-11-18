import { artifactPathAncestors, artifactPathKey } from '@haus/api';
import { and, eq, inArray, isNull, like, notInArray, type SQL } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { artifactsTable as artifacts } from '../postgres/schema.ts';
import { ArtifactError } from './storage.ts';

/**
 * Drive path placement. Call inside a transaction holding the Server row lock: every artifact
 * insert, move, and delete takes that lock, so a path checked free stays free until commit.
 */
export async function liveArtifactAtPath(tx: HausDatabase, serverId: string, path: string) {
    const [artifact] = await tx
        .select()
        .from(artifacts)
        .where(and(live(serverId), eq(artifacts.pathKey, artifactPathKey(path))))
        .limit(1);
    return artifact;
}

/**
 * Checks that `path` can hold a file and returns it with existing folder casing adopted, so
 * `docs/b.md` lands as `Docs/b.md` beside `Docs/a.md`. A live file may never sit where a folder
 * is needed, and the path may not already be a folder. `moving` rows are ignored: they are the
 * files a move is relocating.
 */
export async function placeArtifactPath(
    tx: HausDatabase,
    serverId: string,
    path: string,
    moving: string[] = []
) {
    const ancestors = artifactPathAncestors(path);
    const others = and(
        live(serverId),
        moving.length ? notInArray(artifacts.id, moving) : undefined
    );
    if (ancestors.length) {
        const [file] = await tx
            .select({ path: artifacts.path })
            .from(artifacts)
            .where(and(others, inArray(artifacts.pathKey, ancestors.map(artifactPathKey))))
            .limit(1);
        if (file) {
            throw new ArtifactError(
                `\`${file.path}\` is a file, so it cannot hold \`${path}\`.`,
                409,
                'PATH_CONFLICT'
            );
        }
    }
    const [inside] = await tx
        .select({ path: artifacts.path })
        .from(artifacts)
        .where(and(others, insideFolder(path)))
        .limit(1);
    if (inside) {
        throw new ArtifactError(
            `\`${path}\` is a folder (it holds \`${inside.path}\`).`,
            409,
            'PATH_CONFLICT'
        );
    }
    return await adoptFolderCasing(tx, others, path, ancestors);
}

/** Live artifacts strictly inside `folder`, compared by key. */
export function insideFolder(folder: string): SQL {
    return like(artifacts.pathKey, `${escapeLike(artifactPathKey(folder))}/%`);
}

export function live(serverId: string) {
    return and(eq(artifacts.serverId, serverId), isNull(artifacts.deletedAt));
}

async function adoptFolderCasing(
    tx: HausDatabase,
    others: SQL | undefined,
    path: string,
    ancestors: string[]
) {
    const segments = path.split('/');
    for (let depth = ancestors.length; depth > 0; depth -= 1) {
        const folder = ancestors[depth - 1];
        if (!folder) {
            continue;
        }
        const [sibling] = await tx
            .select({ path: artifacts.path })
            .from(artifacts)
            .where(and(others, insideFolder(folder)))
            .limit(1);
        if (sibling) {
            const existing = sibling.path.split('/').slice(0, depth);
            return [...existing, ...segments.slice(depth)].join('/');
        }
    }
    return path;
}

function escapeLike(value: string) {
    return value.replace(/[\\%_]/gu, '\\$&');
}
