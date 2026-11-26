import { randomBytes } from 'node:crypto';
import { chmod, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { type AttachmentKeychain, buildAttachmentKeychain } from './attachment-keychain.ts';
import { writePrivateJson } from './attachment-store.ts';

export interface PendingAttachment {
    credential: string;
    idempotencyKey: string;
    origin: string;
    slug: string;
}

const pendingDirectory = 'pending-attachments';

export async function getOrCreatePendingAttachment(options: {
    dataRoot: string;
    keychain?: AttachmentKeychain | null;
    origin: string;
    slug: string;
}): Promise<PendingAttachment> {
    const keychain = options.keychain === undefined ? buildAttachmentKeychain : options.keychain;
    const destination = pendingAttachmentPath(options.dataRoot, options.slug);
    const directory = join(options.dataRoot, pendingDirectory);
    await mkdir(directory, { mode: 0o700, recursive: true });
    await chmod(directory, 0o700);

    const existing = await readPendingAttachment(options.dataRoot, options.slug, keychain);
    if (existing) {
        assertPendingAttachmentMatches(existing, options);
        return existing;
    }

    const lock = `${destination}.lock`;
    for (;;) {
        try {
            await mkdir(lock);
            break;
        } catch (cause) {
            if (!isAlreadyExists(cause)) {
                throw cause;
            }
            const recovered = await readPendingAttachment(options.dataRoot, options.slug, keychain);
            if (recovered) {
                assertPendingAttachmentMatches(recovered, options);
                return recovered;
            }
            const lockInfo = await stat(lock).catch(() => null);
            if (lockInfo && Date.now() - lockInfo.mtimeMs > 30_000) {
                await rm(lock, { force: true, recursive: true });
                continue;
            }
            await Bun.sleep(10);
        }
    }

    try {
        const recovered = await readPendingAttachment(options.dataRoot, options.slug, keychain);
        if (recovered) {
            assertPendingAttachmentMatches(recovered, options);
            return recovered;
        }
        const pending: PendingAttachment = {
            credential: randomBytes(32).toString('base64url'),
            idempotencyKey: `cak_${randomBytes(32).toString('base64url')}`,
            origin: options.origin,
            slug: options.slug,
        };
        const { credential, ...record } = pending;
        if (keychain) {
            await keychain.write(pendingAccount(options.slug), credential);
        }
        await writePrivateJson(destination, keychain ? record : pending);
        return pending;
    } finally {
        await rm(lock, { force: true, recursive: true });
    }
}

export async function readPendingAttachment(
    dataRoot: string,
    slug: string,
    keychain: AttachmentKeychain | null = buildAttachmentKeychain
): Promise<PendingAttachment | null> {
    const destination = pendingAttachmentPath(dataRoot, slug);
    let value: unknown;
    try {
        value = JSON.parse(await readFile(destination, 'utf8'));
    } catch (cause) {
        if (isMissing(cause)) {
            return null;
        }
        throw new Error('The pending Computer attachment record is unreadable.');
    }
    const pending = keychain
        ? { ...(value as object), credential: await keychain.read(pendingAccount(slug), slug) }
        : value;
    if (!isPendingAttachment(pending) || pending.slug !== slug) {
        throw new Error('The pending Computer attachment record is invalid.');
    }
    return pending;
}

export async function removePendingAttachment(
    dataRoot: string,
    slug: string,
    keychain: AttachmentKeychain | null = buildAttachmentKeychain
) {
    await rm(pendingAttachmentPath(dataRoot, slug), { force: true });
    await keychain?.delete(pendingAccount(slug));
}

function pendingAccount(slug: string) {
    return `pending-${slug}`;
}

function pendingAttachmentPath(dataRoot: string, slug: string) {
    return join(dataRoot, pendingDirectory, `${slug}.json`);
}

function assertPendingAttachmentMatches(
    pending: PendingAttachment,
    options: { origin: string; slug: string }
) {
    if (pending.origin !== options.origin || pending.slug !== options.slug) {
        throw new Error(
            `A pending Computer attachment for /${options.slug} belongs to another Server origin. Finish or remove it before retrying.`
        );
    }
}

function isPendingAttachment(value: unknown): value is PendingAttachment {
    return (
        typeof value === 'object' &&
        value !== null &&
        typeof (value as PendingAttachment).credential === 'string' &&
        /^[A-Za-z0-9_-]{43}$/u.test((value as PendingAttachment).credential) &&
        typeof (value as PendingAttachment).idempotencyKey === 'string' &&
        /^cak_[A-Za-z0-9_-]{43}$/u.test((value as PendingAttachment).idempotencyKey) &&
        typeof (value as PendingAttachment).origin === 'string' &&
        typeof (value as PendingAttachment).slug === 'string'
    );
}

function isAlreadyExists(cause: unknown): cause is NodeJS.ErrnoException {
    return cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'EEXIST';
}

function isMissing(cause: unknown): cause is NodeJS.ErrnoException {
    return cause instanceof Error && (cause as NodeJS.ErrnoException).code === 'ENOENT';
}
