import type { BuiltInConnection } from '../built-in-connections/built-in-connection.ts';
import { liveWorkspace } from './authority.ts';
import {
    disconnectLinearWorkspace,
    linearAgentRetired,
    linearGrantAdded,
    linearGrantRemoved,
    removeLinearWorkspace,
} from './lifecycle.ts';
import { rederiveLinearTriggerProblems } from './trigger-problem-wakes.ts';

/**
 * The Linear connection's additions to the MCP connection model
 * (specs/linear-app.md#lifecycle). Each hook runs inside the generic code's
 * Server-locked transaction; Linear calls it decides go to the outbox, and
 * every state change re-derives the `linear` Triggers it touches. Only
 * `connectionDeleted` can hand back wakes; the others' notices wait for the
 * owner's next delivery.
 */
export const linearConnection: BuiltInConnection = {
    preset: 'linear',
    agentGrantAdded: async (tx, input) => {
        const now = new Date();
        await linearGrantAdded(tx, input, now);
        await rederiveLinearTriggerProblems(tx, {
            now,
            scope: { ownerAgentId: input.agentId },
            serverId: input.serverId,
        });
    },
    agentGrantRemoved: async (tx, input) => {
        const now = new Date();
        await linearGrantRemoved(tx, input, now);
        await rederiveLinearTriggerProblems(tx, {
            now,
            scope: { ownerAgentId: input.agentId },
            serverId: input.serverId,
        });
    },
    // A retiring Agent's Triggers retire with it: no problem notice to send.
    agentRetired: (tx, input) => linearAgentRetired(tx, input, new Date()),
    connectionDisconnected: async (tx, input) => {
        const now = new Date();
        const workspace = await liveWorkspace(tx, input);
        await disconnectLinearWorkspace(tx, { ...input, now });
        if (workspace) {
            await rederiveLinearTriggerProblems(tx, {
                now,
                scope: { workspaceId: workspace.id },
                serverId: input.serverId,
            });
        }
    },
    connectionDeleted: async (tx, input) => {
        // The tombstone drops its connection id, so find the workspace first.
        const workspace = await liveWorkspace(tx, input);
        await removeLinearWorkspace(tx, input);
        return workspace
            ? await rederiveLinearTriggerProblems(tx, {
                  now: input.now,
                  scope: { workspaceId: workspace.id },
                  serverId: input.serverId,
              })
            : [];
    },
};
