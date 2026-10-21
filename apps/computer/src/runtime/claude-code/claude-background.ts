import type { BackgroundWork } from '../background-work.ts';
import type { ClaudeSystemMessage, ParsedClaudeLine } from './claude-messages.ts';

/**
 * The live background tasks of one `claude` process, from `background_tasks_changed`, which
 * carries the whole set every time membership changes (replace semantics). Ambient tasks are
 * not activity, as Claude Code documents, so they never count.
 */
export class ClaudeBackgroundTasks {
    private live = new Map<string, string>();

    get work(): BackgroundWork {
        const types = [...this.live.values()];
        return {
            subagents: types.filter((type) => type === 'local_agent').length,
            tasks: types.length,
        };
    }

    /** Applies one system message; returns whether the live set changed. */
    apply(message: ClaudeSystemMessage): boolean {
        if (message.subtype !== 'background_tasks_changed' || !message.tasks) {
            return false;
        }
        const next = new Map(
            message.tasks
                .filter((task) => task.ambient !== true)
                .map((task) => [task.task_id, task.task_type])
        );
        const changed =
            next.size !== this.live.size ||
            [...next].some(([id, type]) => this.live.get(id) !== type);
        this.live = next;
        return changed;
    }

    /** The process ended: nothing it ran survives. Returns whether anything was live. */
    clear(): boolean {
        const had = this.live.size > 0;
        this.live = new Map();
        return had;
    }
}

/**
 * A turn Claude Code started by itself (a background task's `task-notification`) while no Haus
 * turn held the connection. Its lines are kept from its `system/init` so a Haus run can adopt
 * it whole; one that reaches its result first is dropped, and the run prompts instead.
 */
export class SelfStartedTurns {
    private current: { announced: boolean; lines: ParsedClaudeLine[] } | null = null;

    /** Whether a self-started turn is still running. */
    get running(): boolean {
        return this.current !== null;
    }

    /**
     * Observes one line no Haus turn took. Returns `true` exactly once per self-started turn:
     * when it reaches the model. A turn that ends before (an orphan notice Claude Code records
     * on resume without calling the model) never wakes anyone.
     */
    observe(line: ParsedClaudeLine): boolean {
        const { message } = line;
        if (message.kind === 'system' && message.message.subtype === 'init') {
            this.current = { announced: false, lines: [line] };
            return false;
        }
        if (!this.current) {
            return false;
        }
        if (message.kind === 'result') {
            this.current = null;
            return false;
        }
        this.current.lines.push(line);
        if (this.current.announced) {
            return false;
        }
        this.current.announced = true;
        return true;
    }

    /** Hands the running self-started turn's lines to a Haus turn, or null when none runs. */
    take(): readonly ParsedClaudeLine[] | null {
        const lines = this.current?.lines ?? null;
        this.current = null;
        return lines;
    }
}
