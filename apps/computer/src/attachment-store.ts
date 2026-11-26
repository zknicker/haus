import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
    AttachmentCredentialUnavailableError,
    type AttachmentKeychain,
    buildAttachmentKeychain,
} from './attachment-keychain.ts';
import type { Attachment, AttachmentRecord } from './attachment.ts';

export function createAttachmentStore(
    dataRoot: string,
    keychain: AttachmentKeychain | null = buildAttachmentKeychain
) {
    const root = join(dataRoot, 'servers');
    const credentials = new Map<string, { computerId: string; credential: string }>();

    async function readAttachmentRecord(serverId: string | undefined) {
        const file = await readAttachmentFile(root, serverId);
        return file && recordOf(file);
    }

    async function readAttachment(serverId: string | undefined): Promise<Attachment | null> {
        const file = await readAttachmentFile(root, serverId);
        if (!file) {
            return null;
        }
        const record = recordOf(file);
        if (keychain === null) {
            return typeof file.credential === 'string'
                ? { ...record, credential: file.credential }
                : null;
        }
        const cached = credentials.get(record.serverId);
        if (cached?.computerId === record.computerId) {
            return { ...record, credential: cached.credential };
        }
        const credential = await keychain.read(record.serverId, record.slug);
        if (credential === null) {
            throw new AttachmentCredentialUnavailableError('missing', record.slug);
        }
        credentials.set(record.serverId, { computerId: record.computerId, credential });
        return { ...record, credential };
    }

    async function writeAttachment(attachment: Attachment) {
        const record = recordOf(attachment);
        if (keychain) {
            await keychain.write(record.serverId, attachment.credential);
        }
        const directory = join(root, record.serverId);
        await mkdir(directory, { mode: 0o700, recursive: true });
        await writePrivateJson(
            join(directory, 'attachment.json'),
            keychain ? record : { ...record, credential: attachment.credential }
        );
        if (keychain) {
            credentials.set(record.serverId, {
                computerId: record.computerId,
                credential: attachment.credential,
            });
        }
    }

    async function listAttachments(): Promise<AttachmentRecord[]> {
        let ids: string[];
        try {
            ids = await readdir(root);
        } catch {
            return [];
        }
        const records = await Promise.all(ids.map(readAttachmentRecord));
        return records.filter((record): record is AttachmentRecord => record !== null);
    }

    async function findAttachment(slug: string) {
        return (await listAttachments()).find((record) => record.slug === slug) ?? null;
    }

    return {
        findAttachment,
        listAttachments,
        readAttachment,
        readAttachmentRecord,
        writeAttachment,
    };
}

export async function writePrivateJson(destination: string, value: unknown) {
    const temporary = `${destination}.${randomBytes(8).toString('hex')}.tmp`;
    try {
        await writeFile(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
        await rename(temporary, destination);
    } finally {
        await rm(temporary, { force: true });
    }
}

async function readAttachmentFile(root: string, serverId: string | undefined) {
    if (!(serverId && /^[A-Za-z0-9_-]+$/u.test(serverId))) {
        return null;
    }
    let value: unknown;
    try {
        value = JSON.parse(await readFile(join(root, serverId, 'attachment.json'), 'utf8'));
    } catch {
        return null;
    }
    return isAttachmentFile(value) ? value : null;
}

function recordOf(file: AttachmentRecord): AttachmentRecord {
    return {
        computerId: file.computerId,
        serverId: file.serverId,
        serverOrigin: file.serverOrigin,
        slug: file.slug,
    };
}

function isAttachmentFile(value: unknown): value is AttachmentRecord & { credential?: unknown } {
    if (typeof value !== 'object' || value === null) {
        return false;
    }
    const file = value as Record<string, unknown>;
    return ['computerId', 'serverId', 'serverOrigin', 'slug'].every(
        (field) => typeof file[field] === 'string'
    );
}
