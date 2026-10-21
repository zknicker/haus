// Shared moves for the room scenarios that place a reminder answer and draw a
// visual: Owner sends, turn gates, every post an Agent made across a channel
// and its Threads, and journaled `haus message send` commands.

/** Owner send through the same hosted contract the App composer uses. */
export function ownerSend(kit, chatId, content, { replyToMessageId, thread } = {}) {
    return kit.trpc('chat.send', {
        attachmentIds: [],
        chatId,
        content,
        nonce: `agenttests_${kit.stamp}_${crypto.randomUUID()}`,
        serverId: kit.serverId,
        ...(replyToMessageId ? { replyToMessageId } : {}),
        ...(thread ? { thread } : {}),
    });
}

export function expectSettled(expect, turn, label) {
    expect(turn.status, `${label} status`).toBe('completed');
    expect(turn.failureKind ?? 'none', `${label} failure kind`).toBe('none');
}

/**
 * An Agent's posts in a fresh channel after `head`, top level, plus every post
 * it made in any Thread of that channel. Each message carries its `chatId`.
 */
export async function postsAcrossChannel(kit, channelId, agentId, head = 0) {
    const own = (message) => message.author.kind === 'agent' && message.author.agentId === agentId;
    const posts = (await kit.readMessages(channelId)).filter(
        (message) => own(message) && message.sequence > head
    );
    const page = await kit.trpc('chat.messages', {
        chatId: channelId,
        limit: 100,
        serverId: kit.serverId,
    });
    for (const thread of page.threads ?? []) {
        await kit.trackChat(thread.threadChatId);
        posts.push(...(await kit.readMessages(thread.threadChatId)).filter(own));
    }
    return posts;
}

/**
 * `haus message send` commands across the Agent's recent runs. Journals sync
 * asynchronously, so each unavailable journal is retried; a run whose journal
 * never syncs is reported, so a caller can refuse to pass a gate on an empty
 * read.
 */
export async function journaledSends(kit, agentId, { attempts = 10, delayMs = 3000 } = {}) {
    const turns = await kit.turns.listTurns(agentId);
    const sends = [];
    const unavailable = [];
    for (const { runId } of turns) {
        let result = null;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            result = await kit.trpc('agent.executionJournal', {
                agentId,
                runId,
                serverId: kit.serverId,
            });
            if (result.status === 'available') {
                break;
            }
            await wait(delayMs);
        }
        if (result?.status !== 'available') {
            unavailable.push(runId);
            continue;
        }
        for (const tool of result.journal.tools) {
            const command = String(tool.input?.command ?? '');
            if (/\bmessage\s+send\b/u.test(command)) {
                sends.push({ command, runId });
            }
        }
    }
    return { sends, unavailable };
}

export function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
