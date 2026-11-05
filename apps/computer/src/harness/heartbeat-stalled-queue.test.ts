import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { composeHeartbeatInput, composeHeartbeatReportInput } from './heartbeat-prompt.ts';

const heartbeat = {
    connections: [],
    createdAt: '2026-10-20T10:05:00.000Z',
    digest: { entries: [], more: 0 },
    id: 'heartbeat:agt_test:2026-10-20:10:00',
    kind: 'daytime' as const,
    leads: [],
    reminders: [],
    since: null,
};

const report = {
    createdAt: '2026-10-20T10:40:00.000Z',
    heartbeatKind: 'daytime' as const,
    heartbeatRunId: 'run_hb',
    id: 'heartbeat-report:run_hb',
    text: 'SEC-12 and SEC-14 are still in todo.',
};

const local = (hour: number, minute: number) => new Date(2026, 9, 20, hour, minute);

test('a daytime run checks for a stalled queue and reports it, since it cannot move a card', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-heartbeat-queue-'));
    try {
        const text = await composeHeartbeatInput(heartbeat, root);
        expect(text).toContain('Daytime, also: run `haus task list --category todo`.');
        expect(text).toContain('a Task still in todo means your queue stalled');
        expect(text).toContain('You can read Tasks here but not move them');
        // "Never resend a finding" would otherwise silence a queue that stays stalled.
        expect(text).toContain('put each key in your report, even one a past report named');

        const nightly = await composeHeartbeatInput({ ...heartbeat, kind: 'nightly' }, root);
        expect(nightly).not.toContain('haus task list');
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});

test('a daytime report resumes a stalled queue in or out of quiet hours; a nightly one does not', () => {
    const resume = 'waiting in todo, your queue stalled: start the next one now.';
    expect(composeHeartbeatReportInput(report, { now: local(14, 5), quietHours: 'on' })).toContain(
        resume
    );
    expect(composeHeartbeatReportInput(report, { now: local(23, 40), quietHours: 'on' })).toContain(
        resume
    );
    expect(
        composeHeartbeatReportInput(
            { ...report, heartbeatKind: 'nightly' },
            { now: local(14, 5), quietHours: 'on' }
        )
    ).not.toContain(resume);
});
