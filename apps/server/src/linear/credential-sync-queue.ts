// One credential's team sync at a time within this Server process
// (specs/linear-app.md#team-scope). A sync reads Linear, joins, then persists
// what it read, all outside the Server lock; two overlapping syncs for one
// credential would let a read taken before the other's join overwrite it.

const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `sequence` after every earlier sequence for `credentialId` settles,
 * whatever their outcome, and answers its own result.
 */
export async function serializeCredentialSync<T>(
    credentialId: string,
    sequence: () => Promise<T>
): Promise<T> {
    const previous = inFlight.get(credentialId) ?? Promise.resolve();
    const current = previous.then(sequence, sequence);
    inFlight.set(credentialId, current);
    try {
        return await current;
    } finally {
        if (inFlight.get(credentialId) === current) {
            inFlight.delete(credentialId);
        }
    }
}
