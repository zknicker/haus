// Exact-set eval chat cleanup: the chats a scenario registered, and nothing
// else. There are no Threads to expand to (ADR 0052); a Task's Chat is
// registered by the scenario that starts it.

const chunkSize = 20;

export async function settleEvalCleanup(operation, timeoutMs = 60_000) {
    let timer;
    try {
        return await Promise.race([
            operation.then(() => true),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(false), timeoutMs);
                timer.unref?.();
            }),
        ]);
    } finally {
        clearTimeout(timer);
    }
}

export function chunkChatIds(chatIds, size = chunkSize) {
    const chunks = [];
    for (let index = 0; index < chatIds.length; index += size) {
        chunks.push(chatIds.slice(index, index + size));
    }
    return chunks;
}

/** Deletes the exact chat set and returns every id it deleted, so callers can forget them. */
export async function cleanupEvalChats({ serverId, trpc }, chatIds) {
    const exactChatIds = [...new Set([...chatIds].filter(Boolean))];
    for (const chunk of chunkChatIds(exactChatIds)) {
        await trpc('dev.cleanupEvalChats', { chatIds: chunk, serverId });
    }
    return exactChatIds;
}
