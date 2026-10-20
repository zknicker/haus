import { afterAll, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentActivityRun } from '../agent-activity-run.ts';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import type { RuntimeSession } from '../runtime/driver.ts';
import { runHarnessTurn, type TurnDriverFactory } from './executor.ts';
import { restorePendingNotice } from './stored-notice.ts';

const runtime = makeDaemonRuntime();
const roots: string[] = [];
afterAll(async () => {
    await runtime.dispose();
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

async function agentRoot() {
    const root = await mkdtemp(join(tmpdir(), 'haus-turn-notices-'));
    roots.push(root);
    await mkdir(join(root, 'runtime'), { recursive: true });
    return root;
}

const pendingNotice = (root: string) => join(root, 'runtime', 'pending-notice.json');

/**
 * A runtime that accepts every steer (`delivered`) but, like a Stop that cancels Claude Code's
 * queue or a Grok interjection still queued at turn end, never hands it to the model.
 */
function droppingDriver(steered: string[]): TurnDriverFactory {
    const session: RuntimeSession = {
        destroy: async () => undefined,
        detach: async () => ({ runtime: 'codex', threadId: 'thread-1', version: 1 }),
        isResume: false,
        sessionId: 'thread-1',
        startTurn: async () => ({
            events: (async function* () {
                yield { input: {}, toolCallId: 'call-1', toolName: 'bash', type: 'tool-call' };
                yield { output: {}, toolCallId: 'call-1', toolName: 'bash', type: 'tool-result' };
                yield { claudePlanUsage: null, type: 'turn-finish', usage: null };
            })(),
            settle: async () => undefined,
            unconsumedSteers: () => [...steered],
        }),
        steer: async (text) => {
            steered.push(text);
            return { delivered: true };
        },
        stop: async () => ({ runtime: 'codex', threadId: 'thread-1', version: 1 }),
    };
    return () => ({
        bootstrapFingerprint: async () => null,
        openSession: async () => session,
        refreshBootstrap: async () => undefined,
        runtimeId: 'codex',
    });
}

function turnInput(root: string, factory: TurnDriverFactory) {
    return {
        activity: new AgentActivityRun(runtime, () => undefined),
        agentId: 'agt_notice',
        agentName: 'Notice',
        agentRoot: root,
        dataRoot: root,
        drainItemIds: [],
        env: {},
        factoryKind: 'ordinary' as const,
        homeDir: join(root, 'home'),
        homeTimezone: 'UTC',
        inbox: [],
        inboxDelivery: 'notice' as const,
        initialRole: null,
        modelId: 'test-model',
        reasoningEffort: 'medium' as const,
        runId: 'run_notice',
        runtime,
        runtimeDriverFactory: factory,
        runtimeId: 'codex',
        serverId: 'srv_test',
        sessionGeneration: 1,
        skillsDir: join(root, 'skills'),
        tools: [],
        totalPending: 0,
        unreadElsewhere: [],
        warmDrainItemIds: [],
        workspaceDir: join(root, 'workspace'),
    };
}

test('a delivered notice the runtime never handed the model returns for the next turn', async () => {
    const root = await agentRoot();
    const notice = 'You have 2 unread messages in #all.';
    await writeFile(
        pendingNotice(root),
        JSON.stringify({ notice, receipt: { runId: 'run_prior', workIds: ['w1'] } })
    );
    const steered: string[] = [];
    const receipts: unknown[] = [];

    await runHarnessTurn({
        ...turnInput(root, droppingDriver(steered)),
        onStoredNoticeDelivered: (receipt) => receipts.push(receipt),
    });

    // The runtime accepted it at the tool boundary, so the notice was acked and cleared...
    expect(steered).toEqual([notice]);
    expect(receipts).toEqual([{ runId: 'run_prior', workIds: ['w1'] }]);
    // ...and because the model never saw it, it is back on the pending path.
    expect(JSON.parse(await readFile(pendingNotice(root), 'utf8'))).toEqual({ notice });
});

test('a newer stored notice wins over the one being returned', async () => {
    const root = await agentRoot();
    await writeFile(pendingNotice(root), JSON.stringify({ notice: 'newer summary' }));
    expect(await restorePendingNotice(root, 'older summary')).toBe(false);
    expect(JSON.parse(await readFile(pendingNotice(root), 'utf8'))).toEqual({
        notice: 'newer summary',
    });
    const empty = await agentRoot();
    expect(await restorePendingNotice(empty, 'returned summary')).toBe(true);
    expect(JSON.parse(await readFile(pendingNotice(empty), 'utf8'))).toEqual({
        notice: 'returned summary',
    });
});
