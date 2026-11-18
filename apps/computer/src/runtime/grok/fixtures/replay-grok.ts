// A stand-in `grok agent stdio` that replays one recorded fixture. Each Haus → Grok message must
// match the next recorded one by method; the replay then plays every recorded Grok frame up to
// the next recorded Haus message, mapping response ids onto the live request ids.
// Usage: bun replay-grok.ts <fixture.jsonl> [grok args...]
import { appendFileSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import {
    FIXTURE_PLACEHOLDERS,
    type FixtureFrame,
    fillPlaceholders,
    parseFixture,
} from './fixture-format.ts';

const [fixturePath, ...grokArgs] = process.argv.slice(2);
if (!fixturePath) {
    throw new Error('Usage: replay-grok.ts <fixture.jsonl>');
}
const frames = parseFixture(readFileSync(fixturePath, 'utf8'));
const logPath = process.env.REPLAY_LOG;
const values = {
    [FIXTURE_PLACEHOLDERS.home]: process.env.HOME ?? '',
    [FIXTURE_PLACEHOLDERS.mcpToken]: process.env.REPLAY_MCP_TOKEN ?? '',
    [FIXTURE_PLACEHOLDERS.mcpUrl]: process.env.REPLAY_MCP_URL ?? '',
    [FIXTURE_PLACEHOLDERS.workspace]: process.cwd(),
    [FIXTURE_PLACEHOLDERS.workspaceUrl]: encodeURIComponent(process.cwd()),
};
const liveIds = new Map<unknown, unknown>();
let cursor = 0;

log({ argv: grokArgs, env: { GROK_HOME: process.env.GROK_HOME, HOME: process.env.HOME } });
playUntilHausMessage();
createInterface({ input: process.stdin }).on('line', (line) => {
    const message = JSON.parse(line) as Record<string, unknown>;
    log(message);
    if (typeof message.method !== 'string') {
        return;
    }
    const expected = frames[cursor];
    if (!(expected?.dir === 'out' && expected.message.method === message.method)) {
        process.stderr.write(`replay mismatch: got ${message.method} at frame ${cursor}\n`);
        process.exit(3);
    }
    if (expected.message.id !== undefined && message.id !== undefined) {
        liveIds.set(expected.message.id, message.id);
    }
    cursor += 1;
    playUntilHausMessage();
});

function playUntilHausMessage() {
    while (cursor < frames.length && !isHausMessage(frames[cursor] as FixtureFrame)) {
        play(frames[cursor] as FixtureFrame);
        cursor += 1;
    }
}

function play(frame: FixtureFrame) {
    switch (frame.dir) {
        case 'in': {
            const isResponse = 'result' in frame.message || 'error' in frame.message;
            const message =
                isResponse && liveIds.has(frame.message.id)
                    ? { ...frame.message, id: liveIds.get(frame.message.id) }
                    : frame.message;
            process.stdout.write(`${fillPlaceholders(JSON.stringify(message), values)}\n`);
            return;
        }
        case 'stderr':
            process.stderr.write(`${frame.line}\n`);
            return;
        case 'exit':
            // Exit only once the frames before it reached the pipe.
            process.stdout.write('', () => process.exit(frame.code));
            cursor = frames.length;
            return;
        case 'out':
            // Haus's own answers to Grok requests are not awaited.
            return;
    }
}

function isHausMessage(frame: FixtureFrame): boolean {
    return frame.dir === 'out' && typeof frame.message.method === 'string';
}

function log(value: unknown) {
    if (logPath) {
        appendFileSync(logPath, `${JSON.stringify(value)}\n`);
    }
}
