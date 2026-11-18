import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Attachment } from './launch.ts';

export function createAttachmentStore(dataRoot: string) {
    const root = join(dataRoot, 'servers');

    async function readAttachment(serverId: string | undefined): Promise<Attachment | null> {
        if (!(serverId && /^[A-Za-z0-9_-]+$/u.test(serverId))) {
            return null;
        }
        const path = join(root, serverId, 'attachment.json');
        let attachment: Attachment;
        try {
            attachment = JSON.parse(await readFile(path, 'utf8')) as Attachment;
        } catch {
            return null;
        }
        return attachment ?? null;
    }

    async function listAttachments(): Promise<Attachment[]> {
        let ids: string[];
        try {
            ids = await readdir(root);
        } catch {
            return [];
        }
        const attachments = await Promise.all(ids.map(readAttachment));
        return attachments.filter((attachment): attachment is Attachment => attachment !== null);
    }

    async function findAttachment(slug: string): Promise<Attachment | null> {
        return (await listAttachments()).find((attachment) => attachment.slug === slug) ?? null;
    }

    return { findAttachment, listAttachments, readAttachment };
}
