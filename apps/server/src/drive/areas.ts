import { type DriveAreaId, artifactPathKey } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import type { ArtifactAccess } from '../artifacts/access.ts';
import { ArtifactError } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, projectsTable, taskKeysTable } from '../postgres/schema.ts';
import { readTaskDriveFolders, requireTaskDriveFolder } from './task-folders.ts';

export interface DriveArea {
    area: DriveAreaId;
    root: string;
}

export interface DrivePlacement extends DriveArea {
    path: string;
}

type PathShape = 'file' | 'folder';

const agentIdPrefix = 'agt_';
const retiredSuffix = '.retired-';
const retiredFolderPattern = /^(.+)\.retired-([A-Za-z0-9_-]{16})$/u;

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
    return await requireWritable(tx, access, await driveAreaOfPath(tx, access.serverId, path));
}

export async function writableDriveFolder(
    tx: HausDatabase,
    access: Pick<ArtifactAccess, 'agentId' | 'serverId'>,
    folder: string
) {
    return await requireWritable(tx, access, await driveAreaOfFolder(tx, access.serverId, folder));
}

async function requireWritable(
    tx: HausDatabase,
    access: Pick<ArtifactAccess, 'agentId' | 'serverId'>,
    placement: DrivePlacement
) {
    const task = await readTaskDriveFolders(tx, access);
    if (!task) {
        return requireDriveWrite(access, placement);
    }
    requireTaskDriveFolder(task.folders, placement.path);
    return placement;
}

export async function serverDriveAreas(db: HausDatabase, serverId: string) {
    const agents = await agentsByHandle(db, serverId);
    const projects = await projectKeys(db, serverId);
    const areas: DriveArea[] = [
        { area: 'haus', root: 'haus' },
        ...projects.map((project) => projectArea(project)),
        ...agents.map((agent, index) =>
            index > 0 && sameHandle(agents[index - 1], agent)
                ? retiredAgentArea(agent)
                : agentArea(agent)
        ),
    ];
    return areas.sort((left, right) => byteOrder(left.area, right.area));
}

export function retiredAgentArea(agent: { handle: string; id: string }) {
    return {
        area: `agent:${agent.id}`,
        root: `agents/${agent.handle}${retiredSuffix}${agent.id.slice(agentIdPrefix.length)}`,
    } satisfies DriveArea;
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
        const area = await agentAreaOfFolder(tx, serverId, second);
        if (!area) {
            throw invalidPath(`No Agent has the handle \`${second}\`, so \`${path}\` has no area.`);
        }
        return placement(area, segments, 2, shape, path);
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

async function agentAreaOfFolder(tx: HausDatabase, serverId: string, folder: string) {
    const retired = retiredFolderPattern.exec(folder);
    const holders = await agentsByHandle(tx, serverId, retired?.[1] ?? folder);
    if (!retired) {
        return holders[0] ? agentArea(holders[0]) : null;
    }
    const id = `${agentIdPrefix}${retired[2]}`.toLowerCase();
    const agent = holders.slice(1).find((holder) => holder.id.toLowerCase() === id);
    return agent ? retiredAgentArea(agent) : null;
}

export async function agentsByHandle(tx: HausDatabase, serverId: string, handle?: string) {
    const handleKey = sql`lower(${agentsTable.handle})`;
    return await tx
        .select({ handle: agentsTable.handle, id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                handle === undefined ? undefined : eq(handleKey, artifactPathKey(handle))
            )
        )
        .orderBy(handleKey, sql`${agentsTable.retiredAt} desc nulls first`, agentsTable.id);
}

function sameHandle(left: { handle: string } | undefined, right: { handle: string }) {
    return left?.handle.toLowerCase() === right.handle.toLowerCase();
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
