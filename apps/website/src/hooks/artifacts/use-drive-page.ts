import type { DrivePageTarget } from '../../features/chats/haus-resource-link.ts';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';
import {
    drivePageListInput,
    drivePagePath,
    namesLegacyWorkbench,
    resolveDrivePage,
} from './drive-page.ts';

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
    const listing = hausTrpc.artifact.list.useQuery(drivePageListInput(serverId, drivePath ?? ''), {
        ...queryPolicy.syncedSnapshot,
        enabled: typeof drivePath === 'string',
    });
    return resolveDrivePage({
        drivePath,
        listed: listing.error ? null : listing.data?.artifacts,
        revisionId: target.revisionId,
    });
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
