export async function readChannelMessages(kit, chatId) {
    return [...(await kit.readMessages(chatId))];
}

export async function authoredInChannel(kit, chatId, agentId, head) {
    return kit.authoredBy(await kit.readMessages(chatId), agentId, head);
}
