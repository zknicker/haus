/** How long a cancelled turn may take to reach the SDK's idle boundary before it is torn down. */
export const stoppedTurnSettleMs = 20_000;

/** A cancelled turn never reached the SDK's idle boundary; it fails as a retryable timeout. */
export class StoppedTurnTimeoutError extends Error {
    constructor(runtimeId: string, timeoutMs: number) {
        super(`The stopped ${runtimeId} turn timed out after ${timeoutMs / 1000}s winding down.`);
        this.name = 'StoppedTurnTimeoutError';
    }
}

/**
 * Waits for a cancelled turn to wind down inside the SDK. Parking a session whose turn is still
 * running stores a continuation, and the SDK then refuses every new prompt until that turn is
 * continued. A runtime that ignores cancellation fails the turn instead, which destroys the live
 * session and keeps the conversation's last idle resume state.
 */
export async function settleStoppedTurn(
    turn: { consumeStream: () => PromiseLike<void> },
    runtimeId: string,
    timeoutMs = stoppedTurnSettleMs
): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new StoppedTurnTimeoutError(runtimeId, timeoutMs)),
            timeoutMs
        );
    });
    try {
        await Promise.race([turn.consumeStream(), deadline]);
    } finally {
        clearTimeout(timer);
    }
}
