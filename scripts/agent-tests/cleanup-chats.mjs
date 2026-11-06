// Exact-set eval chat cleanup. Chats in the set expand to the claim Threads
// they own. A claim Thread whose parent is NOT in the set is never deleted:
// deleting the thread chat alone orphans the durable claim row and breaks the
// Server's claim invariant for everyone (observed live as task.list, now claim.list, 500s).
// Threads promoted from a standing Owner DM are therefore retained — the DM
// preserves them as ordinary collaboration history.

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

export function expandEvalCleanupChatIds(chatIds, claims) {
    const requestedChatIds = new Set([...chatIds].filter(Boolean));
    const retained = [];

    for (const entry of claims) {
        const { chatId, threadChatId } = entry.claim;
        if (requestedChatIds.has(threadChatId) && !requestedChatIds.has(chatId)) {
            requestedChatIds.delete(threadChatId);
            retained.push(threadChatId);
        }
        if (requestedChatIds.has(chatId)) {
            requestedChatIds.add(threadChatId);
        }
    }

    return { chatIds: [...requestedChatIds], retained };
}

export function chunkChatIds(chatIds, size = chunkSize) {
    const chunks = [];
    for (let index = 0; index < chatIds.length; index += size) {
        chunks.push(chatIds.slice(index, index + size));
    }
    return chunks;
}

/**
 * Deletes the exact chat set, expanded to the Threads those chats own.
 * Returns every id it RESOLVED — deleted, or intentionally retained because
 * deleting it alone would orphan a claim — so callers can forget both kinds.
 */
export async function cleanupEvalChats({ serverId, trpc }, chatIds) {
    const requestedChatIds = [...chatIds].filter(Boolean);
    if (requestedChatIds.length === 0) {
        return [];
    }

    const { claims } = await trpc('claim.list', { serverId });
    const expansion = expandEvalCleanupChatIds(requestedChatIds, claims);
    const exactChatIds = new Set(expansion.chatIds);
    for (const chatId of expansion.chatIds) {
        const page = await trpc('chat.messages', { chatId, limit: 100, serverId });
        for (const thread of page.threads) {
            exactChatIds.add(thread.threadChatId);
        }
    }

    for (const chunk of chunkChatIds([...exactChatIds])) {
        await trpc('dev.cleanupEvalChats', { chatIds: chunk, serverId });
    }
    if (expansion.retained.length > 0) {
        process.stderr.write(
            `  · retained ${expansion.retained.length} claim Thread(s) whose parent chat is preserved (claim rows must outlive the eval run)\n`
        );
    }
    return [...exactChatIds, ...expansion.retained];
}
