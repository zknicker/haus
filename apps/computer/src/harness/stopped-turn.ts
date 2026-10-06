/** How long a cancelled turn may take to reach the SDK's idle boundary before it is torn down. */
export const stoppedTurnSettleMs = 20_000;

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
            () =>
                reject(
                    new Error(
                        `The stopped ${runtimeId} turn did not wind down within ${timeoutMs / 1000}s.`
                    )
                ),
            timeoutMs
        );
    });
    try {
        await Promise.race([turn.consumeStream(), deadline]);
    } finally {
        clearTimeout(timer);
    }
}
