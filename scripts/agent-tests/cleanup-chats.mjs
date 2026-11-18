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

export async function cleanupEvalChats({ serverId, trpc }, chatIds) {
    const exactChatIds = [...new Set([...chatIds].filter(Boolean))];
    for (const chunk of chunkChatIds(exactChatIds)) {
        await trpc('dev.cleanupEvalChats', { chatIds: chunk, serverId });
    }
    return exactChatIds;
}
