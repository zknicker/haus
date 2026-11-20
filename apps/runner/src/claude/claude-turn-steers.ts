import { ClaudeTurnError } from './claude-errors.ts';
import type { ClaudeCommandLifecycle } from './claude-messages.ts';

const terminalLifecycle = new Set(['cancelled', 'completed', 'discarded']);
const consumedLifecycle = new Set(['completed', 'started']);

interface Steer {
    ack?: { reject(error: Error): void; resolve(): void };
    delivered: boolean;
    state: string;
    readonly text: string;
}

export const steerReceiptMs = 15_000;

export class SteerReceiptTimeoutError extends ClaudeTurnError {
    constructor() {
        super('Claude did not queue the message.');
        this.name = 'SteerReceiptTimeoutError';
    }
}

export class ClaudeTurnSteers {
    private readonly steers = new Map<string, Steer>();

    get pending() {
        return [...this.steers.values()].some((steer) => !terminalLifecycle.has(steer.state));
    }

    track(uuid: string, text: string) {
        const steer: Steer = { delivered: false, state: 'written', text };
        this.steers.set(uuid, steer);
        return new Promise<void>((resolve, reject) => {
            steer.ack = { reject, resolve };
        });
    }

    delivered(uuid: string) {
        const steer = this.steers.get(uuid);
        if (steer) {
            steer.delivered = true;
        }
    }

    drop(uuid: string) {
        this.steers.delete(uuid);
    }

    onLifecycle(message: ClaudeCommandLifecycle) {
        const steer = this.steers.get(message.command_uuid);
        if (!steer) {
            return false;
        }
        steer.state = message.state;
        if (message.state === 'queued' || message.state === 'started') {
            steer.ack?.resolve();
        } else if (message.state === 'cancelled' || message.state === 'discarded') {
            steer.ack?.reject(new ClaudeTurnError(`Claude ${message.state} the message.`));
        }
        return true;
    }

    completed(uuids: readonly string[]) {
        for (const uuid of uuids) {
            const steer = this.steers.get(uuid);
            if (steer) {
                steer.state = 'completed';
            }
        }
    }

    unconsumed() {
        return [...this.steers.values()]
            .filter((steer) => steer.delivered && !consumedLifecycle.has(steer.state))
            .map((steer) => steer.text);
    }
}

export async function awaitSteerReceipt(receipt: Promise<void>, ms: number) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        await Promise.race([
            receipt,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new SteerReceiptTimeoutError()), ms);
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}
