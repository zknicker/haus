import { expect, test } from 'bun:test';
import type { WorkerAutomation } from '@haus/api';
import { workerFixture } from '../../workers/worker-fixture.ts';
import { cloudAutomationPresentation } from './cloud-automation-model.ts';

const now = Date.parse('2026-10-20T19:00:00Z');
function row(overrides: Partial<WorkerAutomation> = {}): WorkerAutomation {
    return {
        computerHealth: 'healthy',
        conversationChatId: 'cht_one',
        location: { chatId: 'cht_task', kind: 'task', taskId: 'tsk_one' },
        notification: 'waiting',
        worker: workerFixture({ updatedAt: new Date(now).toISOString() }),
        ...overrides,
    };
}

test('a healthy run promises notification; offline and stale tracking do not imply progress', () => {
    expect(cloudAutomationPresentation(row(), now).label).toBe('Working');
    expect(cloudAutomationPresentation(row({ computerHealth: 'offline' }), now).label).toBe(
        'Status unconfirmed'
    );
    expect(cloudAutomationPresentation(row(), now + 11 * 60_000).label).toBe('Status unconfirmed');
});

test('queued delivery remains explicit even after the provider finishes', () => {
    expect(cloudAutomationPresentation(row({ notification: 'pending' }), now)).toMatchObject({
        label: 'Result queued',
        detail: 'Waiting for the Captain to receive the result',
    });
    expect(cloudAutomationPresentation(row({ notification: 'delivered' }), now).detail).toBe(
        'Result delivered to the Captain'
    );
});

test('lost tracking and lost notification targets explain why no wake is coming', () => {
    expect(
        cloudAutomationPresentation(row({ notification: 'computer-removed' }), now).detail
    ).toContain('device was removed');
    expect(
        cloudAutomationPresentation(row({ notification: 'chat-removed' }), now).detail
    ).toContain('conversation was deleted');
    expect(
        cloudAutomationPresentation(row({ notification: 'agent-retired' }), now).detail
    ).toContain('Captain was retired');
});

test('history keeps the provider outcome color after the handoff is delivered', () => {
    const work = workerFixture({
        status: 'failed',
        terminalAt: new Date(now).toISOString(),
    });
    expect(
        cloudAutomationPresentation(row({ notification: 'delivered', worker: work }), now)
    ).toMatchObject({
        color: 'danger',
        label: 'Failed',
    });
});
