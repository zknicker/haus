/**
 * Work a runtime runs past the turn that started it: Claude Code's background sub-agents and
 * shells (specs/runtime-drivers.md "Background work"). The counts are Computer-local facts; only
 * `subagents` crosses to the Server, as the Agent's running sub-agents.
 */
export interface BackgroundWork {
    /** Live background sub-agents. */
    readonly subagents: number;
    /** Every live background task: sub-agents and shells. */
    readonly tasks: number;
}

export const noBackgroundWork: BackgroundWork = { subagents: 0, tasks: 0 };

/**
 * Receives each Agent session's background work, keyed by the Agent root (the warm-pool key).
 * The attachment daemon implements it: it reports the count to the Server and asks the Server
 * for a wake when the runtime starts a turn on its own.
 */
export interface BackgroundWorkListener {
    changed(agentRoot: string, work: BackgroundWork): void;
    /**
     * The runtime started a turn on its own, with no Haus turn running, to report background
     * work that finished or stopped. The model is already running; a Haus run must adopt it.
     */
    wake(agentRoot: string): void;
}
