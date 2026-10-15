import type { LinearWorkspace } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/**
 * The Linear workspace one connection binds, or null when the connection has
 * none yet (installed before, or never finished). `undefined` while loading.
 */
export function useLinearWorkspace(serverId: string, connectionId: string) {
    const select = React.useCallback(
        (workspaces: LinearWorkspace[]) =>
            workspaces.find((workspace) => workspace.connectionId === connectionId) ?? null,
        [connectionId]
    );
    return hausTrpc.linear.workspaces.useQuery(
        { serverId },
        { ...queryPolicy.syncedSnapshot, select }
    );
}
