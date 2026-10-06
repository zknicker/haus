// Only disposable synthetic Server state; never called against an existing Haus stack.
export async function clearWeeklyConversation(fixture) {
    await fixture.harness.sql`delete from reminders where server_id=${fixture.serverId}`;
    await fixture.harness
        .sql`delete from chats where server_id=${fixture.serverId} and kind='thread'`;
    await fixture.harness.sql`delete from chat_messages where server_id=${fixture.serverId}`;
}

async function withWeeklyOwner(fixture, run) {
    const owner = await fixture.signIn('user_agent_creation_owner', ['ada@haus.test']);
    try {
        return await run(owner);
    } finally {
        owner.close();
    }
}

export function sendWeeklyOwnerMessage(fixture, content, nonce) {
    return withWeeklyOwner(fixture, (owner) =>
        owner.trpc.chat.send.mutate({
            chatId: fixture.channelId,
            content,
            nonce,
            serverId: fixture.serverId,
        })
    );
}

export function setWeeklyChannelArchived(fixture, archived) {
    return withWeeklyOwner(fixture, (owner) =>
        owner.trpc.chat[archived ? 'archiveChannel' : 'unarchiveChannel'].mutate({
            chatId: fixture.channelId,
            serverId: fixture.serverId,
        })
    );
}
