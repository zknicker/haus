import { ClaudeTurnError } from './claude-errors.ts';

/** How long a written steer may wait for Claude Code's queue receipt. */
export const steerReceiptMs = 15_000;

/** A written steer's queue receipt did not arrive in time; Claude Code may still run it. */
export class SteerReceiptTimeoutError extends ClaudeTurnError {
    constructor() {
        super('Claude Code did not queue the message.');
        this.name = 'SteerReceiptTimeoutError';
    }
}

/**
 * Waits for a written steer's lifecycle receipt. Rejects with the receipt's own refusal
 * (cancelled or discarded), or with `SteerReceiptTimeoutError` when none arrived in `ms`.
 */
export async function awaitSteerReceipt(receipt: Promise<void>, ms: number): Promise<void> {
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
