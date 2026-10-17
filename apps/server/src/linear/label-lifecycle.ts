import type { HausDatabase } from '../postgres/connection.ts';
import { liveWorkspaces } from './agent-label-reads.ts';
import { archiveAgentLabels, ensurePendingAgentLabels } from './agent-labels.ts';

/**
 * Agent label effects of Linear lifecycle events (specs/linear-app.md#agent-labels-and-delegation).
 * The binding slice calls these from the Linear connection's hooks inside the
 * caller's Server-locked transaction; Linear calls go to the outbox there too,
 * stamped with the caller's `now`.
 */
export const labelLifecycle = {
    /** A granted Agent gets a pending label row in every accessible team. */
    agentGrantAdded: async (
        tx: HausDatabase,
        input: { agentId: string; connectionId: string; serverId: string },
        now: Date
    ): Promise<void> => {
        for (const workspace of await liveWorkspaces(tx, input)) {
            await ensurePendingAgentLabels(tx, workspace, { agentIds: [input.agentId], now });
        }
    },
    /** The Agent's label rows on this connection are archived. */
    agentGrantRemoved: async (
        tx: HausDatabase,
        input: { agentId: string; connectionId: string; serverId: string },
        now: Date
    ): Promise<void> => {
        await archiveAgentLabels(tx, await liveWorkspaces(tx, input), {
            agentId: input.agentId,
            now,
        });
    },
    /** The Agent's label rows on every Linear connection are archived. */
    agentRetired: async (
        tx: HausDatabase,
        input: { agentId: string; serverId: string },
        now: Date
    ): Promise<void> => {
        await archiveAgentLabels(tx, await liveWorkspaces(tx, { serverId: input.serverId }), {
            agentId: input.agentId,
            now,
        });
    },
    /** Newly accessible teams get pending label rows for every granted Agent. */
    teamsChanged: async (
        tx: HausDatabase,
        input: { serverId: string; workspaceId: string },
        now: Date
    ): Promise<void> => {
        const workspace = (await liveWorkspaces(tx, { serverId: input.serverId })).find(
            (candidate) => candidate.id === input.workspaceId
        );
        if (workspace) {
            await ensurePendingAgentLabels(tx, workspace, { now });
        }
    },
};
