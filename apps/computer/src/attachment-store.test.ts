import { afterAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    AttachmentCredentialUnavailableError,
    attachmentKeychain,
    attachmentKeychainService,
} from './attachment-keychain.ts';
import {
    getOrCreatePendingAttachment,
    readPendingAttachment,
    removePendingAttachment,
} from './attachment-state.ts';
import { createAttachmentStore } from './attachment-store.ts';

const service = `${attachmentKeychainService}.test-${randomUUID()}`;
const keychain = attachmentKeychain(service);
const roots: string[] = [];
const accounts = new Set<string>();

afterAll(async () => {
    await Promise.all([...accounts].map((name) => Bun.secrets.delete({ name, service })));
    await Promise.all(roots.map((root) => rm(root, { force: true, recursive: true })));
});

const keychainKeepsItems = process.platform === 'darwin' && (await keychainKeepsProbeItem());

describe('the file attachment store', () => {
    test('keeps the Server credential in a private attachment file', async () => {
        const dataRoot = await temporaryRoot();
        const attachment = attached('srv_file_write');

        await createAttachmentStore(dataRoot, null).writeAttachment(attachment);

        const file = join(dataRoot, 'servers', attachment.serverId, 'attachment.json');
        expect((await stat(file)).mode & 0o777).toBe(0o600);
        const fresh = createAttachmentStore(dataRoot, null);
        expect(await fresh.readAttachment(attachment.serverId)).toEqual(attachment);
        expect(await fresh.listAttachments()).toEqual([withoutCredential(attachment)]);
    });

    test('a record without its credential reads as no attachment', async () => {
        const dataRoot = await temporaryRoot();
        const record = withoutCredential(attached('srv_file_missing'));
        await mkdir(join(dataRoot, 'servers', record.serverId), { recursive: true });
        await writeFile(
            join(dataRoot, 'servers', record.serverId, 'attachment.json'),
            JSON.stringify(record)
        );
        const store = createAttachmentStore(dataRoot, null);

        expect(await store.readAttachment(record.serverId)).toBeNull();
        expect(await store.listAttachments()).toEqual([record]);
    });

    test('a pending setup keeps its credential in its file and clears it when done', async () => {
        const dataRoot = await temporaryRoot();
        const slug = 'file-pending';

        const pending = await getOrCreatePendingAttachment({
            dataRoot,
            keychain: null,
            origin: 'https://haus.test',
            slug,
        });

        expect(await filesContaining(dataRoot, pending.credential)).toHaveLength(1);
        expect(await readPendingAttachment(dataRoot, slug, null)).toEqual(pending);
        await removePendingAttachment(dataRoot, slug, null);
        expect(await readPendingAttachment(dataRoot, slug, null)).toBeNull();
    });
});

describe.skipIf(!keychainKeepsItems)('the Keychain attachment store', () => {
    test("keeps the Server credential out of every file an Agent's tools can read", async () => {
        const dataRoot = await temporaryRoot();
        const attachment = attached('srv_keychain_write');
        accounts.add(attachment.serverId);

        await createAttachmentStore(dataRoot, keychain).writeAttachment(attachment);

        expect(await filesContaining(dataRoot, attachment.credential)).toEqual([]);
        const fresh = createAttachmentStore(dataRoot, keychain);
        expect(await fresh.readAttachment(attachment.serverId)).toEqual(attachment);
        expect(await fresh.listAttachments()).toEqual([withoutCredential(attachment)]);
    });

    test('a record without its Keychain item asks for setup instead of dropping the Server', async () => {
        const dataRoot = await temporaryRoot();
        const record = withoutCredential(attached('srv_keychain_missing'));
        await mkdir(join(dataRoot, 'servers', record.serverId), { recursive: true });
        await writeFile(
            join(dataRoot, 'servers', record.serverId, 'attachment.json'),
            JSON.stringify(record)
        );
        const store = createAttachmentStore(dataRoot, keychain);

        const read = store.readAttachment(record.serverId);

        await expect(read).rejects.toBeInstanceOf(AttachmentCredentialUnavailableError);
        await expect(read).rejects.toMatchObject({ problem: 'missing' });
        expect(await store.listAttachments()).toEqual([record]);
    });

    test('reads the Keychain once per attachment, and again after a new setup', async () => {
        const dataRoot = await temporaryRoot();
        const attachment = attached('srv_keychain_cache');
        accounts.add(attachment.serverId);
        const store = createAttachmentStore(dataRoot, keychain);
        await store.writeAttachment(attachment);
        await keychain.delete(attachment.serverId);

        expect(await store.readAttachment(attachment.serverId)).toEqual(attachment);

        await writeFile(
            join(dataRoot, 'servers', attachment.serverId, 'attachment.json'),
            JSON.stringify({ ...withoutCredential(attachment), computerId: 'cmp_reattached' })
        );
        await expect(store.readAttachment(attachment.serverId)).rejects.toMatchObject({
            problem: 'missing',
        });
    });

    test('a pending setup keeps its credential in the Keychain and clears it when done', async () => {
        const dataRoot = await temporaryRoot();
        const slug = 'keychain-pending';
        accounts.add(`pending-${slug}`);

        const pending = await getOrCreatePendingAttachment({
            dataRoot,
            keychain,
            origin: 'https://haus.test',
            slug,
        });

        expect(await filesContaining(dataRoot, pending.credential)).toEqual([]);
        expect(await readPendingAttachment(dataRoot, slug, keychain)).toEqual(pending);
        await removePendingAttachment(dataRoot, slug, keychain);
        expect(await readPendingAttachment(dataRoot, slug, keychain)).toBeNull();
        expect(await Bun.secrets.get({ name: `pending-${slug}`, service })).toBeNull();
    });
});

async function keychainKeepsProbeItem() {
    const account = `probe-${randomUUID()}`;
    accounts.add(account);
    return await keychain.write(account, randomUUID()).then(
        () => true,
        () => false
    );
}

async function temporaryRoot() {
    const root = await mkdtemp(join(tmpdir(), 'haus-attachment-store-'));
    roots.push(root);
    return root;
}

function attached(serverId: string) {
    return {
        computerId: `cmp_${serverId.slice(4)}`,
        credential: randomUUID(),
        serverId,
        serverOrigin: 'https://haus.test',
        slug: 'hq',
    };
}

function withoutCredential({ credential: _, ...record }: ReturnType<typeof attached>) {
    return record;
}

async function filesContaining(root: string, secret: string) {
    const entries = await readdir(root, { recursive: true, withFileTypes: true });
    const files = entries.filter((entry) => entry.isFile());
    const contents = await Promise.all(
        files.map(async (entry) => ({
            path: join(entry.parentPath, entry.name),
            text: await readFile(join(entry.parentPath, entry.name), 'utf8'),
        }))
    );
    return contents.filter((file) => file.text.includes(secret)).map((file) => file.path);
}
