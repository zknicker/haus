import { afterEach, beforeEach, expect, test } from 'bun:test';
import { createClaudeController } from './controller.ts';

const sessionId = 'cse_test123';
const previousToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
const previousFetch = globalThis.fetch;

beforeEach(() => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sk-ant-oat01-test';
});

afterEach(() => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = previousToken;
    globalThis.fetch = previousFetch;
});

function fillerEvent(sequence: number) {
    return { created_at: null, payload: { type: 'system' }, sequence_num: String(sequence) };
}

function promptEvent(sequence: number) {
    return {
        created_at: null,
        payload: {
            message: { content: 'HAUS_CLOUD_RUN=caw_work/car_run\n\nTrim the copy.' },
            type: 'user',
            uuid: 'prompt-1',
        },
        sequence_num: String(sequence),
    };
}

/** `pageCount` pages of 100 events each, newest first, with the tagged prompt on `promptPage`. */
function stubEventPages(pageCount: number, promptPage: number) {
    globalThis.fetch = ((url: URL | string) => {
        const address = String(url);
        if (address.includes('/oauth/profile')) {
            return Promise.resolve(Response.json({ account: {}, organization: { uuid: 'org' } }));
        }
        const page = Number(new URL(address).searchParams.get('cursor') ?? '0');
        const data =
            page === promptPage
                ? [
                      fillerEvent(page * 100),
                      promptEvent(page * 100 + 1),
                      fillerEvent(page * 100 + 2),
                  ]
                : Array.from({ length: 100 }, (_unused, index) => fillerEvent(page * 100 + index));
        const nextCursor = page + 1 < pageCount ? String(page + 1) : null;
        return Promise.resolve(Response.json({ data, next_cursor: nextCursor }));
    }) as typeof fetch;
}

test('a tagged prompt many pages back is still found, not silently missed', async () => {
    // A session with enough background activity logs far more than a few
    // thousand events before this Run's own prompt (TECH-7). A cap tight
    // enough to miss it would leave `events()` reporting an incomplete
    // history, with no sign anything was cut off.
    stubEventPages(30, 25);
    const controller = createClaudeController();

    const events = await controller.events(sessionId, (event) => logEntriesOfPrompt(event));

    expect(events.at(-1)?.payload).toMatchObject({ type: 'user' });
});

function logEntriesOfPrompt(event: { payload: Record<string, unknown> }): boolean {
    const message = event.payload.message as { content?: unknown } | undefined;
    return typeof message?.content === 'string' && message.content.includes('HAUS_CLOUD_RUN=');
}
