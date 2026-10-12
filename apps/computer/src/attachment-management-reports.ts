import { createAttachmentStore } from './attachment-store.ts';
import {
    readAttachmentManagementEvents,
    recordAttachmentManagementEvent,
} from './attachment-system-event-outbox.ts';

export async function sendSystemEventReport(
    dataRoot: string,
    send: (frame: unknown) => boolean,
    serverId: string
) {
    const events = await readAttachmentManagementEvents(dataRoot, serverId);
    send({ events, type: 'system-event-report' });
}

export async function recordManagementCommandForAttachments(
    dataRoot: string,
    command: 'rollback' | 'start' | 'stop' | 'upgrade'
) {
    const attachments = await createAttachmentStore(dataRoot).listAttachments();
    await Promise.all(
        attachments.map((attachment) =>
            recordAttachmentManagementEvent(dataRoot, attachment.serverId, command)
        )
    );
}
