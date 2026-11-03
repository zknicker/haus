import type { BackgroundWork } from '../background-work.ts';
import type { ClaudeSystemMessage, ParsedClaudeLine } from './claude-messages.ts';

/**
 * The live background tasks of one `claude` process, from `background_tasks_changed`, which
 * carries the whole set every time membership changes (replace semantics). Ambient tasks are
 * not activity, as Claude Code documents, so they never count.
 */
export class ClaudeBackgroundTasks {
    /** task id → its type and when this connection first saw it live (epoch ms). */
    private live = new Map<string, { since: number; type: string }>();

    get work(): BackgroundWork {
        const types = [...this.live.values()].map((task) => task.type);
        return {
            subagents: types.filter((type) => type === 'local_agent').length,
            tasks: types.length,
        };
    }

    /** When the oldest live task started; null when none runs. */
    get since(): number | null {
        const starts = [...this.live.values()].map((task) => task.since);
        return starts.length > 0 ? Math.min(...starts) : null;
    }

    /** Applies one system message; returns whether the live set changed. */
    apply(message: ClaudeSystemMessage, now = Date.now()): boolean {
        if (message.subtype !== 'background_tasks_changed' || !message.tasks) {
            return false;
        }
        const next = new Map(
            message.tasks
                .filter((task) => task.ambient !== true)
                .map((task) => {
                    const known = this.live.get(task.task_id);
                    const since = known?.type === task.task_type ? known.since : now;
                    return [task.task_id, { since, type: task.task_type }] as const;
                })
        );
        const changed =
            next.size !== this.live.size ||
            [...next].some(([id, task]) => this.live.get(id)?.type !== task.type);
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

    /**
     * Hands the running self-started turn to a Haus turn, or null when none runs. `announced`:
     * it reached the model, so a wake was asked for it.
     */
    take(): { announced: boolean; lines: readonly ParsedClaudeLine[] } | null {
        const taken = this.current;
        this.current = null;
        return taken;
    }
}
