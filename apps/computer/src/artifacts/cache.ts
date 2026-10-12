import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import type { ArtifactMetadata } from '@haus/api';
import * as z from 'zod';
import { processExists, withArtifactCacheLock } from './cache-lock.ts';

const leaseSchema = z.object({ pid: z.number().int().positive(), paths: z.array(z.string()) });
const DEFAULT_CACHE_BYTES = 2 * 1024 ** 3;

export class ArtifactCache {
    private readonly leaseId = `${process.pid}-${crypto.randomUUID()}`;
    private readonly pinned = new Set<string>();
    private generation = 0;
    private releaseTail: Promise<void> = Promise.resolve();

    constructor(
        private readonly root: string,
        private readonly capacity = DEFAULT_CACHE_BYTES
    ) {}

    async resolve(input: {
        serverId: string;
        artifact: ArtifactMetadata;
        downloadUrl: string;
        fetcher?: typeof fetch;
    }): Promise<string> {
        await this.releaseTail;
        const generation = this.generation;
        return withArtifactCacheLock(this.root, async () => {
            const folder = join(this.root, digest(input.serverId));
            const path = join(
                folder,
                `${digest(input.artifact.revision_id)}-${input.artifact.sha256}`
            );
            await fs.mkdir(folder, { recursive: true, mode: 0o700 });
            const existing = await fs.stat(path).catch(() => null);
            if (existing && (!existing.isFile() || existing.size !== input.artifact.size_bytes)) {
                throw new Error('Shared artifact cache entry is invalid.');
            }
            if (existing && (await fileDigest(path)) !== input.artifact.sha256) {
                throw new Error('Shared artifact cache entry failed integrity verification.');
            }
            if (!existing) {
                await this.makeRoom(input.artifact.size_bytes);
                await downloadVerified(input, path);
            }
            if (generation !== this.generation) {
                throw new Error('The Agent turn ended before the artifact was available.');
            }
            await fs.utimes(path, new Date(), new Date());
            this.pinned.add(path);
            await this.writeLease();
            return path;
        });
    }

    async release(): Promise<void> {
        this.generation += 1;
        this.releaseTail = this.releaseTail.then(() =>
            withArtifactCacheLock(this.root, async () => {
                this.pinned.clear();
                await fs.rm(join(this.root, '.leases', this.leaseId), { force: true });
            })
        );
        await this.releaseTail;
    }

    private async writeLease(): Promise<void> {
        const folder = join(this.root, '.leases');
        await fs.mkdir(folder, { recursive: true, mode: 0o700 });
        const temporary = join(folder, `${this.leaseId}.tmp`);
        await fs.writeFile(
            temporary,
            JSON.stringify({
                paths: [...this.pinned],
                pid: process.pid,
            }),
            { mode: 0o600 }
        );
        await fs.rename(temporary, join(folder, this.leaseId));
    }

    private async makeRoom(bytes: number): Promise<void> {
        if (bytes > this.capacity) {
            throw new Error('Artifact exceeds the Computer shared cache capacity.');
        }
        const protectedPaths = await readPinnedPaths(this.root);
        const entries: { path: string; size: number; accessed: number }[] = [];
        for (const folder of await fs.readdir(this.root, { withFileTypes: true })) {
            if (!(folder.isDirectory() && /^[a-f0-9]{64}$/u.test(folder.name))) {
                continue;
            }
            for (const entry of await fs.readdir(join(this.root, folder.name), {
                withFileTypes: true,
            })) {
                if (!entry.isFile()) {
                    continue;
                }
                const path = join(this.root, folder.name, entry.name);
                const stat = await fs.stat(path);
                entries.push({ path, size: stat.size, accessed: stat.mtimeMs });
            }
        }
        let used = entries.reduce((total, entry) => total + entry.size, 0);
        for (const entry of entries.sort((a, b) => a.accessed - b.accessed)) {
            if (used + bytes <= this.capacity) {
                break;
            }
            if (protectedPaths.has(entry.path)) {
                continue;
            }
            await fs.rm(entry.path);
            used -= entry.size;
        }
        if (used + bytes > this.capacity) {
            throw new Error(
                'Shared cache is full of files in active turns. Retry after those turns finish.'
            );
        }
    }
}

async function readPinnedPaths(root: string): Promise<Set<string>> {
    const folder = join(root, '.leases');
    await fs.mkdir(folder, { recursive: true, mode: 0o700 });
    const pinned = new Set<string>();
    for (const entry of await fs.readdir(folder)) {
        if (entry.endsWith('.tmp')) {
            continue;
        }
        const path = join(folder, entry);
        const lease = leaseSchema.parse(JSON.parse(await fs.readFile(path, 'utf8')));
        if (!processExists(lease.pid)) {
            await fs.rm(path);
            continue;
        }
        for (const file of lease.paths) {
            pinned.add(file);
        }
    }
    return pinned;
}

async function downloadVerified(
    input: { artifact: ArtifactMetadata; downloadUrl: string; fetcher?: typeof fetch },
    path: string
): Promise<void> {
    const response = await (input.fetcher ?? fetch)(input.downloadUrl, {
        signal: AbortSignal.timeout(300_000),
    });
    if (!(response.ok && response.body)) {
        throw new Error('Artifact download failed.');
    }
    const temporary = `${path}.partial`;
    await fs.rm(temporary, { force: true });
    const file = await fs.open(temporary, 'wx', 0o600);
    const hash = createHash('sha256');
    let size = 0;
    try {
        for await (const chunk of response.body) {
            size += chunk.byteLength;
            if (size > input.artifact.size_bytes) {
                throw new Error('Artifact download exceeded its declared size.');
            }
            hash.update(chunk);
            let offset = 0;
            while (offset < chunk.byteLength) {
                const result = await file.write(chunk, offset, chunk.byteLength - offset);
                offset += result.bytesWritten;
            }
        }
        if (size !== input.artifact.size_bytes || hash.digest('hex') !== input.artifact.sha256) {
            throw new Error('Artifact download failed integrity verification.');
        }
        await file.sync();
        await file.chmod(0o444);
    } catch (error) {
        await fs.rm(temporary, { force: true });
        throw error;
    } finally {
        await file.close();
    }
    await fs.rename(temporary, path);
}

function digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

async function fileDigest(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) {
        hash.update(chunk);
    }
    return hash.digest('hex');
}
