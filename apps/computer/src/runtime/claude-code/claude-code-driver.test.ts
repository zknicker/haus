import { afterEach, beforeEach, expect, test } from 'bun:test';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { RuntimeSession } from '../driver.ts';
import { isRuntimeResumeRejection } from '../resume-rejected.ts';
import type { ClaudeResumeState } from '../resume-state.ts';
import type { TurnEvent } from '../turn-event.ts';
import { createFakeDriverHarness, signal } from './fixtures/fake-driver.ts';
import { collect } from './fixtures/fixture-replay.ts';

let harness: Awaited<ReturnType<typeof createFakeDriverHarness>>;
const sessions: RuntimeSession[] = [];

beforeEach(async () => {
    harness = await createFakeDriverHarness();
});
afterEach(async () => {
    await Promise.all(
        sessions.splice(0).map((session) => session.destroy().catch(() => undefined))
    );
    await harness.close();
});

async function open(
    driver = harness.driver(),
    resumeFrom?: Parameters<ReturnType<typeof harness.driver>['openSession']>[0]['resumeFrom']
) {
    const session = await driver.openSession({
        resumeFrom,
        sessionId: 'agt_test-1',
        signal: signal(),
    });
    sessions.push(session);
    return session;
}

async function turn(session: RuntimeSession, prompt: string): Promise<TurnEvent[]> {
    return await collect((await session.startTurn({ prompt, signal: signal() })).events);
}

const texts = (events: TurnEvent[]) =>
    events.flatMap((event) => (event.type === 'text-delta' ? [event.text] : []));

test('a fresh session launches as the driver contract requires and parks warm', async () => {
    const session = await open();
    expect(session.isResume).toBe(false);
    expect(texts(await turn(session, 'hi'))).toEqual(['echo: hi']);
    const state = await session.detach();
    expect(state).toEqual({
        claudeSessionId: session.sessionId,
        runtime: 'claude-code',
        version: 1,
    });
    const [launch] = await harness.launches();
    expect(launch?.args).toContain('--session-id');
    expect(launch?.args).not.toContain('--resume');
    expect(launch?.env).toEqual({
        CLAUDECODE: null,
        CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
        HOME: harness.homeDir,
        hasHostToolToken: true,
    });
    expect(harness.pool.size).toBe(1);
});

test('launch files are owner-only and hold no credential or host-tool token', async () => {
    const session = await open();
    await turn(session, 'hi');
    const dir = join(harness.homeDir, '.haus-runtime', 'claude-code');
    for (const name of await readdir(dir)) {
        const path = join(dir, name);
        expect((await stat(path)).mode & 0o777).toBe(0o600);
        const content = await readFile(path, 'utf8');
        expect(content).not.toContain('sk-ant-oat-secret');
        expect(content).not.toMatch(/Bearer [A-Za-z0-9_-]{20,}/u);
    }
    expect(await readFile(join(dir, 'claude-system-prompt.md'), 'utf8')).toBe(
        'You are a test Agent.'
    );
});

test('the next turn resumes the warm process without a spawn', async () => {
    const first = await open();
    await turn(first, 'one');
    const state = await first.detach();
    const second = await open(harness.driver(), state);
    expect(second.isResume).toBe(true);
    expect(texts(await turn(second, 'two'))).toEqual(['echo: two']);
    expect(await harness.launches()).toHaveLength(1);
});

test('a per-turn usage refresh claim does not restart the warm process', async () => {
    const first = await open();
    await turn(first, 'one');
    const state = await first.detach();
    const driver = harness.driver({
        env: { HAUS_AGENT_ID: 'agt_test', HAUS_CLAUDE_USAGE_REFRESH: '1' },
    });
    const second = await open(driver, state);
    const events = await turn(second, 'two');
    expect(await harness.launches()).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ claudePlanUsage: null, type: 'turn-finish' });
});

test('changed launch facts resume the conversation in a new process', async () => {
    const first = await open();
    await turn(first, 'one');
    const state = await first.detach();
    const second = await open(harness.driver({ instructions: 'New instructions.' }), state);
    await turn(second, 'two');
    const launches = await harness.launches();
    expect(launches).toHaveLength(2);
    expect(launches[1]?.args.slice(launches[1].args.indexOf('--resume'))[1]).toBe(
        (state as ClaudeResumeState).claudeSessionId
    );
    expect(harness.pool.size).toBe(0);
});

test('a process that dies mid-turn fails the turn with its stderr; the session resumes after', async () => {
    const session = await open();
    await turn(session, 'warm up');
    const events = await turn(session, 'crash');
    const failure = events.at(-1);
    expect(failure).toMatchObject({ type: 'error' });
    expect(failure?.type === 'error' && String(failure.error)).toContain('code 3');
    expect(failure?.type === 'error' && String(failure.error)).toContain('boom');
    expect(texts(await turn(session, 'again'))).toEqual(['echo: again']);
    expect((await harness.launches())[1]?.args).toContain('--resume');
});

test('a stored conversation Claude Code cannot find is a prompt resume rejection', async () => {
    const session = await open(harness.driver(), {
        claudeSessionId: 'missing-1',
        runtime: 'claude-code',
        version: 1,
    });
    const events = await turn(session, 'hi');
    const failure = events.at(-1);
    expect(failure?.type).toBe('error');
    expect(isRuntimeResumeRejection(failure?.type === 'error' ? failure.error : null)).toBe(true);
});

test('a legacy harness state resumes its Claude conversation; another runtime’s is rejected', async () => {
    const session = await open(harness.driver(), {
        data: { bridge: { port: 1 }, claudeSessionId: 'legacy-conversation' },
        harnessId: 'claude-code',
        specificationVersion: 'harness-v1',
        type: 'resume-session',
    });
    await turn(session, 'hi');
    expect((await harness.launches())[0]?.args).toContain('legacy-conversation');
    const rejected = harness.driver().openSession({
        resumeFrom: { runtime: 'codex', threadId: 't', version: 1 },
        sessionId: 'agt_test-1',
    });
    expect(isRuntimeResumeRejection(await rejected.catch((error: unknown) => error))).toBe(true);
});

test('stop ends the process and still returns the resume state', async () => {
    const session = await open();
    await turn(session, 'hi');
    const state = await session.stop();
    expect(state).toMatchObject({ runtime: 'claude-code', version: 1 });
    expect(harness.pool.size).toBe(0);
    const [launch] = await harness.launches();
    expect(() => process.kill(launch?.pid ?? 0, 0)).toThrow();
});
