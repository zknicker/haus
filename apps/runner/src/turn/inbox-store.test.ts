import { afterAll, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { agentNoticeCommandSchema, agentStartCommandSchema } from '@haus/api';
import { inboxStore } from './inbox-store.ts';
import { readPendingNotice, restorePendingNotice } from './pending-notice.ts';

const root = await mkdtemp(join(tmpdir(), 'haus-runner-inbox-'));
afterAll(() => rm(root, { force: true, recursive: true }));

const agentId = '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d02';
const chatId = '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d01';
const busyRun = '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d03';
const nextRun = '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d04';
const maya = {
    chatId,
    content: 'Can you draft the launch note?',
    createdAt: '2026-11-19T15:01:00.000Z',
    id: '0196f0c4-7c2e-7a4b-9d3e-2f1a6b8c9d11',
    senderHandle: 'maya',
    senderType: 'human',
    sequence: 1,
    target: '#product',
} as const;

const noticeGuidance = [
    "These messages have not been read. Choose when to read them: `haus message read --target <target> --unread` reads one conversation's unread messages; `haus inbox check` lists every conversation with unread messages.",
    'Their bodies are withheld to avoid flooding you, not absent. The notice is not itself a request, so do not acknowledge it. If what you read is higher priority, pivot to it; otherwise continue your current work. Deferral needs no visible reply and the messages remain queryable; read them before you stop.',
];

function busyNotice() {
    return agentNoticeCommandSchema.parse({
        agentId,
        inbox: [maya],
        runId: busyRun,
        totalPending: 1,
        type: 'notice',
    });
}

test('a busy notice is stored with its receipt until a run accepts the work', async () => {
    const runtimeDir = join(root, 'agent-a', 'runtime');
    const store = inboxStore(runtimeDir);
    const receipt = { runId: busyRun, workIds: [maya.id] };
    const notice = await store.replace(busyNotice(), receipt);
    expect(notice).toBe(
        [
            '[Haus inbox notice:',
            'Inbox update: 1 unread message total; 1 changed target',
            '#product  pending: 1 message · first msg=0196f0c4 · latest sender @maya · latest msg=0196f0c4',
            ']',
            ...noticeGuidance,
        ].join('\n')
    );
    expect(await readPendingNotice(runtimeDir)).toEqual({ notice: notice ?? '', receipt });
    await store.acceptRun(
        agentStartCommandSchema.parse({
            agentId,
            agentName: 'blippy',
            chatId,
            drainItemIds: [maya.id],
            inbox: [maya],
            inboxDelivery: 'concrete',
            modelId: 'claude-sonnet-5',
            runId: nextRun,
            runtimeId: 'claude-agent-sdk',
            sessionGeneration: 1,
            totalPending: 1,
            type: 'start',
        })
    );
    expect(await readPendingNotice(runtimeDir)).toBeNull();
    expect(await store.replace(busyNotice(), receipt)).toBeNull();
});

test('a returned steer restores the notice only when no newer one was stored', async () => {
    const runtimeDir = join(root, 'agent-b', 'runtime');
    expect(await restorePendingNotice(runtimeDir, 'older notice')).toBe(true);
    expect(await readPendingNotice(runtimeDir)).toEqual({ notice: 'older notice' });
    const store = inboxStore(runtimeDir);
    await store.consume(['nothing-pending']);
    expect(await readPendingNotice(runtimeDir)).toBeNull();
    await store.replace(busyNotice(), { runId: busyRun, workIds: [maya.id] });
    expect(await restorePendingNotice(runtimeDir, 'older notice')).toBe(false);
    expect((await readPendingNotice(runtimeDir))?.notice.startsWith('[Haus inbox notice:')).toBe(
        true
    );
});
