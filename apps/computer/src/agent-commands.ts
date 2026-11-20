/** Server→Computer command to clear one Agent's local directory. */
export interface AgentResetCommand {
    agentId: string;
    kind: 'full' | 'session';
    sessionGeneration: number;
    type: 'agent-reset';
}

/** Server-scoped instruction to erase this attachment's local partition. */
export interface ServerDeleteCommand {
    type: 'server-delete';
}
