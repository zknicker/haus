export function currentTurnAttempt(turn: {
    acceptedAttempt: number | null;
    dispatchAttempt: number;
}) {
    return turn.acceptedAttempt ?? turn.dispatchAttempt;
}
