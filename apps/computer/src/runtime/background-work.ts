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
 * What a driver reports about its session's background work, keyed by the Agent root. The
 * runtime context forwards it to the daemon's listener, adding whether a loss was deliberate.
 */
export interface BackgroundWorkReports {
    absorbed(agentRoot: string): void;
    changed(agentRoot: string, work: BackgroundWork): void;
    lost(agentRoot: string): void;
    wake(agentRoot: string): void;
}

/**
 * Receives each Agent session's background work, keyed by the Agent root (the warm-pool key).
 * The attachment daemon implements it: it reports the count to the Server and asks the Server
 * for a wake when the runtime starts a turn on its own.
 */
export interface BackgroundWorkListener {
    /**
     * A run that was not the wake (a human message's run) adopted the turn the runtime started
     * on its own; that run handles the report, so the wake asked for it is retired.
     */
    absorbed(agentRoot: string): void;
    changed(agentRoot: string, work: BackgroundWork): void;
    /**
     * The runtime process ended while background work still ran, so that work is gone.
     * `deliberate`: Haus ended it on purpose (Stop, reset, retirement), so nobody is told.
     */
    lost(agentRoot: string, deliberate: boolean): void;
    /** Haus ended the Agent's process on purpose: owe no wake and leave no lost-work marker. */
    retire(agentRoot: string): Promise<void>;
    /** Resolves once every report already made for the Agent reached its files. */
    settled(agentRoot: string): Promise<void>;
    /**
     * The runtime started a turn on its own, with no Haus turn running, to report background
     * work that finished or stopped. The model is already running; a Haus run must adopt it.
     */
    wake(agentRoot: string): void;
}
