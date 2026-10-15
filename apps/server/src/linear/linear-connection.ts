import type { BuiltInConnection } from '../built-in-connections/built-in-connection.ts';
import {
    disconnectLinearWorkspace,
    linearAgentRetired,
    linearGrantAdded,
    linearGrantRemoved,
    removeLinearWorkspace,
} from './lifecycle.ts';

/**
 * The Linear connection's additions to the MCP connection model
 * (specs/linear-app.md#lifecycle). Each hook runs inside the generic code's
 * Server-locked transaction; Linear calls it decides go to the outbox.
 */
export const linearConnection: BuiltInConnection = {
    preset: 'linear',
    agentGrantAdded: (tx, input) => linearGrantAdded(tx, input, new Date()),
    agentGrantRemoved: (tx, input) => linearGrantRemoved(tx, input, new Date()),
    agentRetired: (tx, input) => linearAgentRetired(tx, input, new Date()),
    connectionDisconnected: (tx, input) =>
        disconnectLinearWorkspace(tx, { ...input, now: new Date() }),
    connectionDeleted: async (tx, input) => {
        await removeLinearWorkspace(tx, input);
        return [];
    },
};
