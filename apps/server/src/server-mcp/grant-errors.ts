import { McpDeniedError } from './errors.ts';

/**
 * Grant refusals stay `McpDeniedError`s, so the human tRPC path keeps its FORBIDDEN mapping and
 * message; the subclasses let the Agent API give each refusal its own stable code.
 */

/** The Agent and the connection are not on the same Server. */
export class McpGrantScopeError extends McpDeniedError {
    constructor() {
        super('The Agent and MCP connection must share a Server.');
        this.name = 'McpGrantScopeError';
    }
}

/** Access can only be turned on for a connection that is connected. */
export class McpGrantDisconnectedError extends McpDeniedError {
    constructor() {
        super('Connect this MCP server before enabling Agent access.');
        this.name = 'McpGrantDisconnectedError';
    }
}

/** The calling Agent is not a connection admin on this Server. */
export class ConnectionAdminRequiredError extends McpDeniedError {
    constructor() {
        super(
            'This Agent is not a connection admin. A Server Owner or Admin must make it one on its Agent profile under Connections.'
        );
        this.name = 'ConnectionAdminRequiredError';
    }
}
