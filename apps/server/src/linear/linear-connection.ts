import type { BuiltInConnection } from '../built-in-connections/built-in-connection.ts';

/**
 * The Linear connection's additions to the MCP connection model
 * (specs/linear-app.md#lifecycle). It reacts to no lifecycle event yet: the
 * binding slice adds grant, retirement, disconnect, and delete effects, and
 * `agentGrantAdded` marks Agent labels pending.
 */
export const linearConnection: BuiltInConnection = {
    preset: 'linear',
};
