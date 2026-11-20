import { readFileSync } from 'node:fs';
import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Credential, CredentialStore } from '@earendil-works/pi-ai';
import * as z from 'zod';

export const chatgptProviderId = 'openai-codex';

export function piLoginsDir(dataDir: string) {
    return join(dataDir, 'logins');
}

export function openFileCredentialStore(directory: string) {
    const tails = new Map<string, Promise<unknown>>();
    const serialized = <T>(providerId: string, operation: () => Promise<T>) => {
        const run = (tails.get(providerId) ?? Promise.resolve()).then(operation);
        tails.set(
            providerId,
            run.then(
                () => undefined,
                () => undefined
            )
        );
        return run;
    };
    const read = (providerId: string) => readCredential(directory, providerId);
    const store: CredentialStore = {
        delete: (providerId) =>
            serialized(providerId, async () => {
                await unlinkIfPresent(credentialFile(directory, providerId));
            }),
        async list() {
            const names = await readdirIfPresent(directory);
            const providerIds = names.flatMap((name) => {
                const match = credentialFileName.exec(name);
                return match?.[1] ? [match[1]] : [];
            });
            const entries = await Promise.all(
                providerIds.map(async (providerId) => {
                    const credential = await read(providerId);
                    return credential ? [{ providerId, type: credential.type }] : [];
                })
            );
            return entries.flat();
        },
        modify: (providerId, change) =>
            serialized(providerId, async () => {
                const current = await read(providerId);
                const next = await change(current);
                if (next === undefined) {
                    return current;
                }
                await writeCredential(directory, providerId, next);
                return next;
            }),
        read,
    };
    return store;
}

export function chatgptLoginState(dataDir: string) {
    let raw: string;
    try {
        raw = readFileSync(credentialFile(piLoginsDir(dataDir), chatgptProviderId), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return 'missing';
        }
        return 'failed';
    }
    return credentialSchema.safeParse(parseJson(raw)).data?.type === 'oauth' ? 'ready' : 'failed';
}

async function readCredential(directory: string, providerId: string) {
    let raw: string;
    try {
        raw = await readFile(credentialFile(directory, providerId), 'utf8');
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
        }
        throw error;
    }
    const parsed = credentialSchema.safeParse(parseJson(raw));
    if (!parsed.success) {
        throw new Error(
            `The ${providerId} sign-in file is not a credential: ${z.prettifyError(parsed.error)}`
        );
    }
    const credential: Credential = parsed.data;
    return credential;
}

function parseJson(raw: string) {
    try {
        const parsed: unknown = JSON.parse(raw);
        return parsed;
    } catch {
        return null;
    }
}

async function writeCredential(directory: string, providerId: string, credential: Credential) {
    await mkdir(directory, { mode: 0o700, recursive: true });
    const destination = credentialFile(directory, providerId);
    const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(credential)}\n`, { mode: 0o600 });
    await rename(temporary, destination);
}

function credentialFile(directory: string, providerId: string) {
    if (!providerIdPattern.test(providerId)) {
        throw new Error(`${JSON.stringify(providerId)} is not a provider id.`);
    }
    return join(directory, `${providerId}.json`);
}

async function readdirIfPresent(directory: string) {
    try {
        return await readdir(directory);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
}

async function unlinkIfPresent(file: string) {
    try {
        await unlink(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}

const providerIdPattern = /^[a-z0-9][a-z0-9-]*$/u;
const credentialFileName = /^([a-z0-9][a-z0-9-]*)\.json$/u;

const credentialSchema = z.discriminatedUnion('type', [
    z.looseObject({
        access: z.string().min(1),
        expires: z.number(),
        refresh: z.string().min(1),
        type: z.literal('oauth'),
    }),
    z.looseObject({
        env: z.record(z.string(), z.string()).optional(),
        key: z.string().optional(),
        type: z.literal('api_key'),
    }),
]);
