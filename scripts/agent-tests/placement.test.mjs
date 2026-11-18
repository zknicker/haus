import { expect, test } from 'bun:test';
import { namesKitRules, refersToKit, starterKit } from './placement-kit.mjs';
import { classifyPlacement, journalCommands, parseDoneSends, refersTo } from './placement.mjs';

test('parses --done anywhere in the invocation, with every target spelling', () => {
    const sends = parseDoneSends([
        "haus message send --done --target '#all' --reply-to msg_1 <<'EOF'\nIt is in.\nEOF",
        'haus message send --target="task:SEC-12" <<EOF --done\nstep two\nEOF',
        'haus message send \\\n  --target "dm:@zach" \\\n  --done <<-"BODY"\nanswer\nBODY',
        "cat <<'EOF' | haus message send --target #all --done\npiped\nEOF",
    ]);
    expect(sends).toEqual([
        { body: 'It is in.', replyTo: 'msg_1', target: '#all' },
        { body: 'step two', replyTo: '', target: 'task:SEC-12' },
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
        "haus message send --target '#all' <<'EOF'\nUse haus message send --target '#all' --done to finish.\nEOF\nhaus message send --target 'task:SEC-12' <<'EOF'\nnote\nEOF",
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

test('a found-the-kit result names, links, or quotes the kit', () => {
    const paths = ['pod-folder-system-starter-kit'];
    expect(
        refersToKit(
            'Yep. I can see and open [Pod Folder System Starter Kit](http://localhost:46324/s/dev/artifacts/art_dZdyxnsN_4fNDT63).',
            { paths }
        )
    ).toBe(true);
    expect(
        refersToKit('Yes, it is at `design-factory/pod-folder-system-starter-kit.md`.', { paths })
    ).toBe(true);
    expect(refersToKit('Titles now cap at 50 chars and art must be pure black or white.')).toBe(
        true
    );
    expect(refersToKit('Still nothing named kit.', { paths })).toBe(false);
    expect(refersToKit('Yep, I can see it.', { paths })).toBe(false);
});

test('classifies placement as inline in the channel, top level, in a Task, or elsewhere', () => {
    const context = { channelId: 'chat', requestId: ['request'], taskChatIds: ['task'] };
    const at = (chatId, rootMessageId) => ({
        chatId,
        reply: rootMessageId ? { parentMessageId: rootMessageId, rootMessageId } : null,
    });
    expect(classifyPlacement(at('chat', 'request'), context)).toBe('inline-reply');
    expect(classifyPlacement(at('chat'), context)).toBe('top-level');
    expect(classifyPlacement(at('chat', 'other'), context)).toBe('top-level');
    expect(classifyPlacement(at('task'), context)).toBe('task');
    expect(classifyPlacement(at('dm'), context)).toBe('elsewhere');
});
