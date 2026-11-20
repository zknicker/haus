import type { ArtifactRecord } from '@haus/api';
import type { DrivePageTarget } from '../../features/chats/haus-resource-link.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import { drivePagePath, namesLegacyWorkbench } from './drive-page.ts';

export type DrivePage =
    | { artifact: ArtifactRecord; status: 'ready' }
    | { status: 'failed' }
    | { status: 'loading' }
    | { status: 'missing' };

export function useDrivePage(serverId: string, target: DrivePageTarget) {
    const legacy = namesLegacyWorkbench(target.path);
    const handle = hausTrpc.agent.get.useQuery(
        { agentId: target.agentId ?? '', serverId },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: legacy && target.agentId !== undefined,
            select: selectHandle,
        }
    );
    const drivePath = drivePagePath(target.path, legacy ? agentHandle(target, handle) : null);
    const lookup = hausTrpc.artifact.byPath.useQuery(
        { path: drivePath ?? '', revision_id: target.revisionId, serverId },
        { ...queryPolicy.syncedSnapshot, enabled: typeof drivePath === 'string' }
    );
    const page: DrivePage =
        drivePath === null || lookup.error?.data?.code === 'NOT_FOUND'
            ? { status: 'missing' }
            : lookup.error
              ? { status: 'failed' }
              : lookup.data
                ? { artifact: lookup.data.artifact, status: 'ready' }
                : { status: 'loading' };
    return page;
}

function agentHandle(target: DrivePageTarget, handle: { data?: string; error: unknown }) {
    if (target.agentId === undefined || handle.error) {
        return null;
    }
    return handle.data;
}

function selectHandle(agent: { handle: string }) {
    return agent.handle;
}
