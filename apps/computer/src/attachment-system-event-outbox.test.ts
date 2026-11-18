import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    readAttachmentManagementEvents,
    recordAttachmentManagementEvent,
} from './attachment-system-event-outbox.ts';

test('management event outbox retains one hundred stable typed events', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-system-events-'));
    const serverId = 'srv_history';
    try {
        for (let index = 0; index < 105; index += 1) {
            await recordAttachmentManagementEvent(
                dataRoot,
                serverId,
                'restart',
                new Date(Date.UTC(2026, 0, 1, 0, 0, index))
            );
        }

        const events = await readAttachmentManagementEvents(dataRoot, serverId);
        expect(events).toHaveLength(100);
        expect(events.at(0)).toEqual({
            command: 'restart',
            id: expect.stringMatching(/^cse_[A-Za-z0-9_-]{16}$/u),
            occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, 5)).toISOString(),
            type: 'management-command',
        });
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});
