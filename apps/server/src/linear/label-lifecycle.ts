import type { HausDatabase } from '../postgres/connection.ts';

/**
 * Agent label effects of Linear lifecycle events (specs/linear-app.md#agent-labels-and-delegation).
 * The binding slice calls these from the Linear connection's hooks inside the
 * caller's Server-locked transaction; the labels slice implements them.
 */
export const labelLifecycle = {
    /** A granted Agent gets a pending label row in every accessible team. */
    agentGrantAdded: async (
        _tx: HausDatabase,
        _input: { agentId: string; connectionId: string; serverId: string }
    ): Promise<void> => {},
    /** The Agent's label rows on this connection are archived. */
    agentGrantRemoved: async (
        _tx: HausDatabase,
        _input: { agentId: string; connectionId: string; serverId: string }
    ): Promise<void> => {},
    /** The Agent's label rows on every Linear connection are archived. */
    agentRetired: async (
        _tx: HausDatabase,
        _input: { agentId: string; serverId: string }
    ): Promise<void> => {},
    /** Newly accessible teams get pending label rows for every granted Agent. */
    teamsChanged: async (
        _tx: HausDatabase,
        _input: { serverId: string; workspaceId: string }
    ): Promise<void> => {},
};
