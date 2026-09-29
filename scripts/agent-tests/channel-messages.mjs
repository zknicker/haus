/** Fresh scenario-owned channels include ordinary and task Threads alike. */
export async function readChannelMessages(kit, chatId) {
    const messages = [...(await kit.readMessages(chatId))];
    const page = await kit.trpc('chat.messages', {
        chatId,
        limit: 100,
        serverId: kit.serverId,
    });
    for (const thread of page.threads) {
        await kit.trackChat(thread.threadChatId);
        messages.push(...(await kit.readMessages(thread.threadChatId)));
    }
    return messages;
}

/**
 * What an Agent wrote in a fresh scenario-owned channel since `head`: top-level
 * messages after the head sequence, plus everything in its Threads. A Thread
 * has its own sequence, and every Thread in a fresh channel opened after the
 * head, so its messages all count.
 */
export async function authoredInChannel(kit, chatId, agentId, head) {
    const authored = kit.authoredBy(await kit.readMessages(chatId), agentId, head);
    const page = await kit.trpc('chat.messages', {
        chatId,
        limit: 100,
        serverId: kit.serverId,
    });
    for (const thread of page.threads) {
        await kit.trackChat(thread.threadChatId);
        authored.push(...kit.authoredBy(await kit.readMessages(thread.threadChatId), agentId, 0));
    }
    return authored;
}
