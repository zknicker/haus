// Placement evidence shared by the placement eval scenarios and its grader:
// where each Agent post landed relative to the human's request, and which
// `haus message send --done` commands the turn ran.

/**
 * Where one Agent post landed:
 * - `inline-reply`: in the channel/DM, in the reply chain of the request.
 * - `top-level`: in the channel/DM, outside the request's reply chain.
 * - `working-thread`: in a Thread anchored on one of the Agent's own posts.
 * - `request-thread`: in a Thread anchored on the request.
 * - `other-thread`: in any other Thread.
 */
export function classifyPlacement(
    message,
    { channelId, ownAnchors = [], requestId, threads = [] }
) {
    const requests = asSet(requestId);
    if (message.chatId === channelId) {
        return requests.has(message.reply?.rootMessageId) ? 'inline-reply' : 'top-level';
    }
    const thread = threads.find((entry) => entry.threadChatId === message.chatId);
    if (thread && asSet(ownAnchors).has(thread.anchorMessageId)) {
        return 'working-thread';
    }
    if (thread && requests.has(thread.anchorMessageId)) {
        return 'request-thread';
    }
    return 'other-thread';
}

/** The latest message matching `predicate`, or null. */
export function findResultPost(messages, predicate) {
    return messages.findLast(predicate) ?? null;
}

/**
 * `haus message send` invocations carrying `--done`, with their target and
 * heredoc body. Handles `--done` anywhere in the invocation, backslash line
 * continuations, `--target x`, `--target=x`, and quoted targets. Heredoc bodies
 * are skipped as text, so `--done` written inside a message never counts.
 */
export function parseDoneSends(commands) {
    return commands.flatMap((command) =>
        shellStatements(command).flatMap(({ bodies, logical }) => doneSendsIn(logical, bodies))
    );
}

/**
 * Splits a shell command into logical lines (backslash continuations joined),
 * each with the heredoc bodies it opens. Body lines are consumed here, so they
 * are never parsed as commands.
 */
function shellStatements(command) {
    const lines = command.split('\n');
    const statements = [];
    let index = 0;
    while (index < lines.length) {
        let logical = lines[index];
        while (/\\\s*$/u.test(logical) && index + 1 < lines.length) {
            index += 1;
            logical = `${logical.replace(/\\\s*$/u, ' ')}${lines[index]}`;
        }
        index += 1;
        const bodies = [];
        for (const [, , delimiter] of logical.matchAll(heredocPattern())) {
            const end = lines.findIndex((line, at) => at >= index && line.trim() === delimiter);
            const stop = end === -1 ? lines.length : end;
            bodies.push(lines.slice(index, stop).join('\n').trim());
            index = stop + 1;
        }
        statements.push({ bodies, logical });
    }
    return statements;
}

/** `--done` sends in one logical line, pairing each with the heredoc body it reads. */
function doneSendsIn(logical, bodies) {
    const sends = [];
    let heredocIndex = 0;
    for (const segment of logical.split(/&&|\|\||;|\|/u)) {
        const ownsHeredoc = heredocPattern().test(segment);
        // `cat <<EOF | haus message send …` pipes the line's only body in.
        const fallback = bodies.length === 1 ? bodies[0] : '';
        const body = ownsHeredoc ? (bodies[heredocIndex] ?? '') : fallback;
        heredocIndex += ownsHeredoc ? 1 : 0;
        const flags = segment.replace(heredocPattern(), ' ');
        if (/\bhaus\s+message\s+send\b/u.test(flags) && /(?:^|\s)--done(?=\s|=|$)/u.test(flags)) {
            sends.push({
                body,
                replyTo: parseFlag(flags, '--reply-to'),
                target: parseFlag(flags, '--target'),
            });
        }
    }
    return sends;
}

/** A thread target is a parent target plus a message short ID: `#general:1a2b3c4d`. */
export function isThreadTarget(target) {
    return /^(?:#[^:\s]+|dm:@[^:\s]+):\w+$/u.test(target.trim());
}

/** Whitespace-separated words in a post. */
export function wordCount(text) {
    return text.split(/\s+/u).filter(Boolean).length;
}

/**
 * Live evidence for a settled turn: every Agent post since the turn began,
 * labeled by placement, plus the turn's `--done` sends and which of them went
 * to a Thread.
 */
export async function readPlacement(kit, turn, { agentId, channelId, requestIds }) {
    const page = await kit.trpc('chat.messages', {
        chatId: channelId,
        limit: 100,
        serverId: kit.serverId,
    });
    const ownAnchors = page.messages
        .filter((message) => message.author.kind === 'agent' && message.author.agentId === agentId)
        .map((message) => message.id);
    const context = { channelId, ownAnchors, requestId: requestIds, threads: page.threads };
    const channelPosts = (await turn.authoredMessagesIn(channelId)).filter(
        (message) => message.chatId === channelId
    );
    const threadPosts = [];
    for (const thread of page.threads) {
        await kit.trackChat(thread.threadChatId);
        const posts = (await turn.authoredMessagesIn(thread.threadChatId)).filter(
            (message) => message.chatId === thread.threadChatId
        );
        threadPosts.push(...posts);
    }
    const label = (message) => ({ label: classifyPlacement(message, context), message });
    const doneSends = parseDoneSends(await journalCommands(kit, agentId, turn));
    const threadBodies = new Set(threadPosts.map((message) => message.content.trim()));
    return {
        channelPosts: channelPosts.map(label),
        doneInThread: doneSends.filter(
            (send) =>
                isThreadTarget(send.target) || (send.body !== '' && threadBodies.has(send.body))
        ),
        doneSends,
        page,
        threadPosts: threadPosts.map(label),
    };
}

/**
 * Shell commands from every run of a settled turn. Journals sync from the
 * Computer asynchronously, so a `missing` journal right after settlement is
 * retried; one that never becomes available is an error, never an empty list
 * that would let a `--done` gate pass vacuously.
 */
export async function journalCommands(kit, agentId, turn, { attempts = 10, delayMs = 3000 } = {}) {
    const commands = [];
    for (const runId of turn.runIds ?? [turn.runId]) {
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
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        if (result?.status !== 'available') {
            throw new Error(
                `Execution journal for run ${runId} stayed ${result?.status ?? 'unreadable'} after ${attempts} tries; --done evidence is unavailable.`
            );
        }
        commands.push(
            ...result.journal.tools
                .map((tool) => tool.input?.command)
                .filter((command) => typeof command === 'string')
        );
    }
    return commands;
}

/** Whether a `--reply-to` value (full ID or short ID) names `messageId`. */
export function refersTo(replyTo, messageId) {
    const short = (id) => id.replace(/^msg_/u, '');
    return replyTo !== '' && short(messageId).startsWith(short(replyTo));
}

/**
 * The turn finished with `--done`: at least one `--done` send, and one of them
 * targets the channel/DM (not a Thread) replying to the request. With
 * `requestIds` empty the reply-to check is skipped (a request that arrived in a
 * Thread is answered there without `--reply-to`).
 */
export function expectDoneToRequest(
    expect,
    placement,
    { requestIds = [], threadTarget = false } = {}
) {
    expect(placement.doneSends.length >= 1, '--done send found in the turn journal').toBe(true);
    const answering = placement.doneSends.filter(
        (send) =>
            isThreadTarget(send.target) === threadTarget &&
            (requestIds.length === 0 || requestIds.some((id) => refersTo(send.replyTo, id)))
    );
    expect(
        answering.length >= 1,
        `--done send to the ${threadTarget ? 'request Thread' : 'channel replying to the request'} (saw ${placement.doneSends.map((send) => `${send.target} reply-to=${send.replyTo || 'none'}`).join('; ')})`
    ).toBe(true);
}

/** The spec's shared assertions: result inline, request thread empty, no `--done` into a Thread. */
export function expectSharedPlacement(expect, placement, result) {
    expect(Boolean(result), 'result post in the channel').toBe(true);
    expect(result.label, 'result post placement').toBe('inline-reply');
    expect(
        placement.threadPosts.filter((entry) => entry.label === 'request-thread').length,
        'posts in the request thread'
    ).toBe(0);
    expect(
        placement.doneInThread.map((send) => send.target),
        '--done sends that went to a Thread'
    ).toHaveLength(0);
}

/** A heredoc opener (`<<EOF`, `<<-'EOF'`), never a `<<<` here-string. */
function heredocPattern() {
    return /(?<!<)<<-?\s*(['"]?)([\w-]+)\1(?!<)/gu;
}

function parseFlag(flags, name) {
    const match = flags.match(
        new RegExp(`${name}(?:\\s+|=)(?:"([^"]*)"|'([^']*)'|([^\\s;&|<>]+))`, 'u')
    );
    return match ? (match[1] ?? match[2] ?? match[3]) : '';
}

function asSet(value) {
    if (value instanceof Set) {
        return value;
    }
    return new Set((Array.isArray(value) ? value : [value]).filter(Boolean));
}
