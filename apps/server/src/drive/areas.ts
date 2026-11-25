import { type DriveAreaId, artifactPathKey } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { ArtifactAccess } from '../artifacts/access.ts';
import { ArtifactError } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';

export interface DriveArea {
    area: DriveAreaId;
    root: string;
}

export interface DrivePlacement extends DriveArea {
    path: string;
}

type PathShape = 'file' | 'folder';

export async function driveAreaOfPath(tx: HausDatabase, serverId: string, path: string) {
    return await placeInArea(tx, serverId, path, 'file');
}

export async function driveAreaOfFolder(tx: HausDatabase, serverId: string, folder: string) {
    return await placeInArea(tx, serverId, folder, 'folder');
}

export function mayWriteDriveArea(access: Pick<ArtifactAccess, 'agentId'>, area: DriveAreaId) {
    return (
        access.agentId === null ||
        area === 'haus' ||
        area.startsWith('project:') ||
        area === `agent:${access.agentId}`
    );
}

export function requireDriveWrite<Area extends DriveArea>(
    access: Pick<ArtifactAccess, 'agentId'>,
    placement: Area
) {
    if (!mayWriteDriveArea(access, placement.area)) {
        throw new ArtifactError(
            `\`${placement.root}\` belongs to another Agent. An Agent writes \`haus/\`, Projects, and its own \`agents/<handle>/\`.`,
            403,
            'FORBIDDEN'
        );
    }
    return placement;
}

export async function writableDrivePath(
    tx: HausDatabase,
    access: Pick<ArtifactAccess, 'agentId' | 'serverId'>,
    path: string
) {
    return requireDriveWrite(access, await driveAreaOfPath(tx, access.serverId, path));
}

export async function writableDriveFolder(
    tx: HausDatabase,
    access: Pick<ArtifactAccess, 'agentId' | 'serverId'>,
    folder: string
) {
    return requireDriveWrite(access, await driveAreaOfFolder(tx, access.serverId, folder));
}

export async function serverDriveAreas(db: HausDatabase, serverId: string) {
    const handleKey = sql`lower(${agentsTable.handle})`;
    const agents = await db
        .selectDistinctOn([handleKey], { handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(eq(agentsTable.serverId, serverId))
        .orderBy(handleKey, sql`${agentsTable.retiredAt} desc nulls first`);
    const projects = await projectKeys(db, serverId);
    const areas: DriveArea[] = [
        { area: 'haus', root: 'haus' },
        ...projects.map((project) => projectArea(project)),
        ...agents.map((agent) => agentArea(agent)),
    ];
    return areas.sort((left, right) => byteOrder(left.area, right.area));
}

async function placeInArea(tx: HausDatabase, serverId: string, path: string, shape: PathShape) {
    const segments = path.split('/');
    const [first = '', second] = segments;
    const folder = artifactPathKey(first);
    if (folder === 'haus') {
        return placement({ area: 'haus', root: 'haus' }, segments, 1, shape, path);
    }
    if (
        folder === 'agents' &&
        second !== undefined &&
        (segments.length > 2 || shape === 'folder')
    ) {
        const agent = await agentByHandle(tx, serverId, second);
        if (!agent) {
            throw invalidPath(`No Agent has the handle \`${second}\`, so \`${path}\` has no area.`);
        }
        return placement(agentArea(agent), segments, 2, shape, path);
    }
    if (
        folder === 'projects' &&
        second !== undefined &&
        (segments.length > 2 || shape === 'folder')
    ) {
        const [project] = await projectKeys(tx, serverId, second);
        if (!project) {
            throw invalidPath(`No Project has the key \`${second}\`, so \`${path}\` has no area.`);
        }
        return placement(projectArea(project), segments, 2, shape, path);
    }
    if (folder === 'agents' || folder === 'projects') {
        const inside = folder === 'agents' ? 'agents/<handle>/' : 'projects/<key>/';
        throw invalidPath(
            `\`${path}\` sits directly in \`${folder}/\`. Its files live in \`${inside}\`.`
        );
    }
    throw invalidPath(
        `\`${path}\` is outside Drive's areas. Paths start with \`haus/\`, \`projects/<key>/\`, or \`agents/<handle>/\`.`
    );
}

function placement(
    area: DriveArea,
    segments: string[],
    rootDepth: number,
    shape: PathShape,
    path: string
) {
    if (shape === 'file' && segments.length <= rootDepth) {
        throw invalidPath(
            `\`${path}\` is an area folder, not a file. Put files inside it, such as \`${area.root}/notes.md\`.`
        );
    }
    return {
        ...area,
        path: [area.root, ...segments.slice(rootDepth)].join('/'),
    } satisfies DrivePlacement;
}

async function agentByHandle(tx: HausDatabase, serverId: string, handle: string) {
    const [agent] = await tx
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                eq(sql`lower(${agentsTable.handle})`, artifactPathKey(handle))
            )
        )
        .orderBy(sql`${agentsTable.retiredAt} desc nulls first`)
        .limit(1);
    return agent;
}

async function projectKeys(tx: HausDatabase, serverId: string, key?: string) {
    return await tx
        .select({ id: projectsTable.chatId, key: taskKeysTable.key })
        .from(projectsTable)
        .innerJoin(
            taskKeysTable,
            and(
                eq(taskKeysTable.serverId, projectsTable.serverId),
                eq(taskKeysTable.id, projectsTable.taskKeyId)
            )
        )
        .where(
            and(
                eq(projectsTable.serverId, serverId),
                key === undefined
                    ? undefined
                    : eq(sql`lower(${taskKeysTable.key})`, artifactPathKey(key))
            )
        );
}

function projectArea(project: { id: string; key: string }) {
    return { area: `project:${project.id}`, root: `projects/${project.key}` } satisfies DriveArea;
}

function agentArea(agent: { handle: string; id: string }) {
    return { area: `agent:${agent.id}`, root: `agents/${agent.handle}` } satisfies DriveArea;
}

function byteOrder(left: string, right: string) {
    if (left === right) {
        return 0;
    }
    return left < right ? -1 : 1;
}

function invalidPath(message: string) {
    return new ArtifactError(message, 400, 'INVALID_PATH');
}
