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
 * up in `built-in-connections.ts`. Typed tRPC routers and webhook routes stay
 * statically composed at the Server's composition root.
 *
 * Every lifecycle hook runs inside the generic code's transaction, which
 * already holds the Server row lock. A service implements only the hooks it
 * reacts to.
 */
export interface BuiltInConnection {
    /** Runs before the connection row goes. Returns the Agents to wake after commit. */
    connectionDeleted?: (
        tx: HausDatabase,
        input: { connectionId: string; now: Date; serverId: string }
    ) => Promise<AgentWake[]>;
    preset: McpPreset;
}
