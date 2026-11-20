import type { ArtifactRecord } from '@haus/api';

export type DrivePageResolution =
    | { status: 'loading' }
    | { status: 'missing' }
    | { artifactId: string; revisionId?: string; status: 'ready' };

export function drivePagePath(fencePath: string, agentHandle: null | string | undefined) {
    const [root, ...rest] = fencePath.split('/');
    if (rest.length === 0) {
        return null;
    }
    if (root === 'drive') {
        return rest.join('/');
    }
    if (root !== 'workbench') {
        return null;
    }
    if (agentHandle === undefined) {
        return undefined;
    }
    return agentHandle ? `agents/${agentHandle}/${fencePath}` : null;
}

export function namesLegacyWorkbench(fencePath: string) {
    return fencePath.startsWith('workbench/');
}

export function drivePageListInput(serverId: string, path: string) {
    const segments = path.split('/');
    return {
        limit: 50,
        prefix: segments.slice(0, -1).join('/'),
        query: segments.at(-1) ?? '',
        serverId,
    };
}

export function resolveDrivePage({
    drivePath,
    listed,
    revisionId,
}: {
    drivePath: null | string | undefined;
    listed: null | readonly Pick<ArtifactRecord, 'artifact_id' | 'path'>[] | undefined;
    revisionId?: string;
}) {
    if (drivePath === null || listed === null) {
        return missing;
    }
    if (drivePath === undefined || listed === undefined) {
        return loading;
    }
    const key = drivePath.toLowerCase();
    const artifact = listed.find((candidate) => candidate.path.toLowerCase() === key);
    if (!artifact) {
        return missing;
    }
    const ready: DrivePageResolution = revisionId
        ? { artifactId: artifact.artifact_id, revisionId, status: 'ready' }
        : { artifactId: artifact.artifact_id, status: 'ready' };
    return ready;
}

const missing: DrivePageResolution = { status: 'missing' };
const loading: DrivePageResolution = { status: 'loading' };
