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

test('a tagged prompt a few pages back is found within the scan bound', async () => {
    stubEventPages(30, 15);
    const controller = createClaudeController();

    const page = await controller.events(sessionId, (event) => logEntriesOfPrompt(event));

    expect(page.truncated).toBe(false);
    expect(page.events.at(-1)?.payload).toMatchObject({ type: 'user' });
});

test('a prompt beyond the scan bound is reported as truncated, not silently missed', async () => {
    // A session with enough background activity can log far more than this
    // one bounded discovery scan reads back through. The caller must learn
    // the scan gave up rather than treat this the same as a session that
    // never took the prompt at all — the resulting `queued` forever even
    // once the Run has long finished is the production bug (TECH-7). The
    // caller only pays this cost once per Run: a later reading resumes from
    // where it left off instead of rescanning from here on every tick.
    stubEventPages(30, 25);
    const controller = createClaudeController();

    const page = await controller.events(sessionId, (event) => logEntriesOfPrompt(event));

    expect(page.truncated).toBe(true);
    expect(page.events).toHaveLength(20 * 100);
});

function logEntriesOfPrompt(event: { payload: Record<string, unknown> }): boolean {
    const message = event.payload.message as { content?: unknown } | undefined;
    return typeof message?.content === 'string' && message.content.includes('HAUS_CLOUD_RUN=');
}
