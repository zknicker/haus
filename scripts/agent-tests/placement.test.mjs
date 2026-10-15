import { expect, test } from 'bun:test';
import {
    classifyPlacement,
    isThreadTarget,
    journalCommands,
    parseDoneSends,
    refersTo,
} from './placement.mjs';
import { namesKitRules, starterKit } from './placement-kit.mjs';

test('parses --done anywhere in the invocation, with every target spelling', () => {
    const sends = parseDoneSends([
        "haus message send --done --target '#all' --reply-to msg_1 <<'EOF'\nIt is in.\nEOF",
        'haus message send --target="#all:1a2b3c4d" <<EOF --done\nstep two\nEOF',
        'haus message send \\\n  --target "dm:@zach" \\\n  --done <<-"BODY"\nanswer\nBODY',
        "cat <<'EOF' | haus message send --target #all --done\npiped\nEOF",
    ]);
    expect(sends).toEqual([
        { body: 'It is in.', replyTo: 'msg_1', target: '#all' },
        { body: 'step two', replyTo: '', target: '#all:1a2b3c4d' },
        { body: 'answer', replyTo: '', target: 'dm:@zach' },
        { body: 'piped', replyTo: '', target: '#all' },
    ]);
});

test('a short reply-to ID refers to the full message ID', () => {
    expect(refersTo('1a2b3c4d', 'msg_1a2b3c4d5e6f')).toBe(true);
    expect(refersTo('msg_1a2b3c4d5e6f', 'msg_1a2b3c4d5e6f')).toBe(true);
    expect(refersTo('9f9f9f9f', 'msg_1a2b3c4d5e6f')).toBe(false);
    expect(refersTo('', 'msg_1a2b3c4d5e6f')).toBe(false);
});

test('journal reads retry a missing journal and refuse to pass vacuously', async () => {
    let reads = 0;
    const kit = {
        serverId: 'server',
        trpc: async () => {
            reads += 1;
            return reads < 3
                ? { status: 'missing' }
                : {
                      journal: { tools: [{ input: { command: 'ls' } }, { input: {} }] },
                      status: 'available',
                  };
        },
    };
    expect(await journalCommands(kit, 'agent', { runId: 'run' }, { delayMs: 0 })).toEqual(['ls']);
    const never = { serverId: 'server', trpc: async () => ({ status: 'missing' }) };
    await expect(
        journalCommands(never, 'agent', { runId: 'run' }, { attempts: 2, delayMs: 0 })
    ).rejects.toThrow(/stayed missing/u);
});

test('never counts --done or a send written inside a heredoc body', () => {
    const sends = parseDoneSends([
        "haus message send --target '#all' <<'EOF'\nUse haus message send --target '#all' --done to finish.\nEOF\nhaus message send --target '#all:abcd1234' <<'EOF'\nnote\nEOF",
        "echo 'haus message send --done' > notes.md",
        'printf %s "$x" <<< "--done"',
    ]);
    expect(sends).toEqual([]);
});

test('a found-the-kit result names at least two seeded rules', () => {
    expect(namesKitRules(starterKit)).toBe(true);
    expect(namesKitRules('Titles now cap at 50 chars and art must be pure black or white.')).toBe(
        true
    );
    expect(namesKitRules('Found it. Reading the trademark section now.')).toBe(false);
    expect(namesKitRules('On it.')).toBe(false);
});

test('thread targets carry a message short ID', () => {
    expect(isThreadTarget('#all:1a2b3c4d')).toBe(true);
    expect(isThreadTarget('dm:@zach:1a2b3c4d')).toBe(true);
    expect(isThreadTarget('#all')).toBe(false);
    expect(isThreadTarget('dm:@zach')).toBe(false);
});

test('classifies placement against the request and the Agent anchors', () => {
    const context = {
        channelId: 'chat',
        ownAnchors: ['pickup'],
        requestId: ['request'],
        threads: [
            { anchorMessageId: 'pickup', threadChatId: 'working' },
            { anchorMessageId: 'request', threadChatId: 'asked' },
            { anchorMessageId: 'other', threadChatId: 'elsewhere' },
        ],
    };
    const at = (chatId, rootMessageId) => ({
        chatId,
        reply: rootMessageId ? { parentMessageId: rootMessageId, rootMessageId } : null,
    });
    expect(classifyPlacement(at('chat', 'request'), context)).toBe('inline-reply');
    expect(classifyPlacement(at('chat'), context)).toBe('top-level');
    expect(classifyPlacement(at('chat', 'other'), context)).toBe('top-level');
    expect(classifyPlacement(at('working'), context)).toBe('working-thread');
    expect(classifyPlacement(at('asked'), context)).toBe('request-thread');
    expect(classifyPlacement(at('elsewhere'), context)).toBe('other-thread');
});
