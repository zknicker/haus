import type { LinearTrigger, Trigger } from '@haus/api';
import * as React from 'react';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** The Agents' undeleted `linear` Triggers listening through one connection. */
export function useLinearTriggers(serverId: string, connectionId: string) {
    const select = React.useCallback(
        (triggers: Trigger[]) => linearTriggersOn(triggers, connectionId),
        [connectionId]
    );
    return hausTrpc.trigger.list.useQuery({ serverId }, { ...queryPolicy.syncedSnapshot, select });
}

export function linearTriggersOn(triggers: readonly Trigger[], connectionId: string) {
    return triggers.filter(
        (trigger): trigger is LinearTrigger =>
            trigger.kind === 'linear' && trigger.linear.connectionId === connectionId
    );
}
