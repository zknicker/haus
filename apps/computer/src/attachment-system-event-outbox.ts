import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    type ComputerManagementCommand,
    type ComputerManagementEvent,
    computerManagementEventSchema,
} from '@haus/api';

const retainedEventCount = 100;

export async function recordAttachmentManagementEvent(
    dataRoot: string,
    serverId: string,
    command: ComputerManagementCommand,
    occurredAt = new Date()
) {
    const event: ComputerManagementEvent = {
        command,
        id: `cse_${randomBytes(12).toString('base64url')}`,
        occurredAt: occurredAt.toISOString(),
        type: 'management-command',
    };
    const root = systemEventOutboxRoot(dataRoot, serverId);
    await mkdir(root, { mode: 0o700, recursive: true });
    const name = `${occurredAt.getTime().toString().padStart(16, '0')}-${event.id}.json`;
    await writeFile(join(root, name), `${JSON.stringify(event)}\n`, { mode: 0o600 });
    const entries = (await readdir(root)).sort();
    await Promise.all(
        entries.slice(0, -retainedEventCount).map((entry) => rm(join(root, entry), { force: true }))
    );
    return event;
}

export async function readAttachmentManagementEvents(dataRoot: string, serverId: string) {
    const root = systemEventOutboxRoot(dataRoot, serverId);
    const entries = (await readdir(root).catch(() => [])).sort().slice(-retainedEventCount);
    const events = await Promise.all(
        entries.map(async (entry) => {
            try {
                const parsed = computerManagementEventSchema.safeParse(
                    JSON.parse(await readFile(join(root, entry), 'utf8'))
                );
                return parsed.success ? parsed.data : null;
            } catch {
                return null;
            }
        })
    );
    return events.filter((event): event is ComputerManagementEvent => event !== null);
}

function systemEventOutboxRoot(dataRoot: string, serverId: string) {
    return join(dataRoot, 'servers', serverId, 'system-event-outbox');
}
