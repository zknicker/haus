import type { McpPreset } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';

/** An Agent to wake once the caller's transaction commits. */
export interface AgentWake {
    agentId: string;
    serverId: string;
}

/**
 * What one built-in connection adds to the generic MCP connection model.
 * Generic connection code reaches a service only through this shape, looked
 * up by preset in `built-in-connections.ts`.
 */
export interface BuiltInConnection {
    /**
     * Runs inside the deletion transaction, which holds the Server row lock,
     * before the connection row goes. Returns the Agents to wake after commit.
     */
    beforeDelete: (
        tx: HausDatabase,
        input: { connectionId: string; now: Date; serverId: string }
    ) => Promise<AgentWake[]>;
    preset: McpPreset;
}
