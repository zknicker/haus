import { ClaudeTurnError } from './claude-errors.ts';
import type { ClaudeCommandLifecycle } from './claude-messages.ts';

const terminalLifecycle = new Set(['cancelled', 'completed', 'discarded']);
/** Lifecycle states that prove Claude Code handed the message to the model. */
const consumedLifecycle = new Set(['completed', 'started']);

interface Steer {
    ack?: { reject(error: Error): void; resolve(): void };
    /** The steer reported `delivered` to its caller. */
    delivered: boolean;
    state: string;
    readonly text: string;
}

/**
 * The steers one Claude turn wrote, followed through Claude Code's `command_lifecycle` receipts:
 * which are still pending (holding the turn open) and which the model never received.
 */
export class ClaudeTurnSteers {
    private readonly steers = new Map<string, Steer>();

    /** Whether a steer still waits for Claude Code to run, cancel, or discard it. */
    get pending(): boolean {
        return [...this.steers.values()].some((steer) => !terminalLifecycle.has(steer.state));
    }

    /** Tracks a steer about to be written; resolves once Claude Code queues or starts it. */
    track(uuid: string, text: string): Promise<void> {
        const steer: Steer = { delivered: false, state: 'written', text };
        this.steers.set(uuid, steer);
        return new Promise<void>((resolve, reject) => {
            steer.ack = { reject, resolve };
        });
    }

    delivered(uuid: string): void {
        const steer = this.steers.get(uuid);
        if (steer) {
            steer.delivered = true;
        }
    }

    /** A steer nothing will answer: it must not hold the turn open. */
    drop(uuid: string): void {
        this.steers.delete(uuid);
    }

    /** Applies one receipt; returns whether it named a steer of this turn. */
    onLifecycle(message: ClaudeCommandLifecycle): boolean {
        const steer = this.steers.get(message.command_uuid);
        if (!steer) {
            return false;
        }
        steer.state = message.state;
        if (message.state === 'queued' || message.state === 'started') {
            steer.ack?.resolve();
        } else if (message.state === 'cancelled' || message.state === 'discarded') {
            steer.ack?.reject(new ClaudeTurnError(`Claude Code ${message.state} the message.`));
        }
        return true;
    }

    /** A result answered these messages. */
    completed(uuids: readonly (string | null | undefined)[]): void {
        for (const uuid of uuids) {
            const steer = uuid ? this.steers.get(uuid) : undefined;
            if (steer) {
                steer.state = 'completed';
            }
        }
    }

    /** Delivered steers Claude Code never started: cancelled by an interrupt, or still queued. */
    unconsumed(): readonly string[] {
        return [...this.steers.values()]
            .filter((steer) => steer.delivered && !consumedLifecycle.has(steer.state))
            .map((steer) => steer.text);
    }
}
