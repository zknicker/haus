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
    /** One of the Agent's grants on this service's connection was revoked. */
    agentGrantRemoved?: (
        tx: HausDatabase,
        input: { agentId: string; connectionId: string; serverId: string }
    ) => Promise<void>;
    /** The Agent is being retired; runs for every built-in connection. */
    agentRetired?: (
        tx: HausDatabase,
        input: { agentId: string; serverId: string }
    ) => Promise<void>;
    /** Runs before the connection row goes. Returns the Agents to wake after commit. */
    connectionDeleted?: (
        tx: HausDatabase,
        input: { connectionId: string; now: Date; serverId: string }
    ) => Promise<AgentWake[]>;
    /** The connection signed out; its Agent grants are cleared in the same transaction. */
    connectionDisconnected?: (
        tx: HausDatabase,
        input: { connectionId: string; serverId: string }
    ) => Promise<void>;
    preset: McpPreset;
}
