import { randomBytes } from 'node:crypto';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Attachment } from './launch.ts';

export const computerMachineUnlinkedExitCode = 77;

export async function archiveUnlinkedAttachment(
    dataRoot: string,
    attachment: Attachment
): Promise<string> {
    const source = join(dataRoot, 'servers', attachment.serverId, 'attachment.json');
    const timestamp = new Date().toISOString().replaceAll(/[^0-9]/gu, '');
    const suffix = randomBytes(4).toString('hex');
    const destination = `${source}.unlinked-${timestamp}-${suffix}.bak`;
    await rename(source, destination);
    return destination;
}

export async function markTerminalUnlinked(
    dataRoot: string,
    attachment: Attachment
): Promise<void> {
    const destination = terminalUnlinkedPath(dataRoot, attachment);
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(
        temporary,
        `${JSON.stringify({
            at: new Date().toISOString(),
            computerId: attachment.computerId,
            reason: 'computer_machine_unlinked',
            statusCode: 403,
        })}\n`,
        { mode: 0o600 }
    );
    await rename(temporary, destination);
}

export async function clearTerminalUnlinked(
    dataRoot: string,
    attachment: Attachment
): Promise<void> {
    if (await isTerminalUnlinked(dataRoot, attachment)) {
        await rm(terminalUnlinkedPath(dataRoot, attachment), { force: true });
    }
}

export async function isTerminalUnlinked(
    dataRoot: string,
    attachment: Attachment
): Promise<boolean> {
    try {
        const marker = JSON.parse(
            await readFile(terminalUnlinkedPath(dataRoot, attachment), 'utf8')
        ) as {
            computerId?: unknown;
            reason?: unknown;
        };
        return (
            marker.computerId === attachment.computerId &&
            marker.reason === 'computer_machine_unlinked'
        );
    } catch {
        return false;
    }
}

function terminalUnlinkedPath(dataRoot: string, attachment: Attachment): string {
    return join(dataRoot, 'servers', attachment.serverId, 'terminal-unlinked.json');
}
