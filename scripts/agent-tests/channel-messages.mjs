/** Every message in a fresh scenario-owned channel, inline replies included. */
export async function readChannelMessages(kit, chatId) {
    return [...(await kit.readMessages(chatId))];
}

/** What an Agent wrote in a fresh scenario-owned channel since `head`, inline replies included. */
export async function authoredInChannel(kit, chatId, agentId, head) {
    return kit.authoredBy(await kit.readMessages(chatId), agentId, head);
}
