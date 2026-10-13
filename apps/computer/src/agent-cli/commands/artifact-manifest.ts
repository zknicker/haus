import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { artifactPathKey } from '@haus/api';
import * as z from 'zod';
import { AgentCliError } from '../agent-error.ts';

/**
 * `.haus-artifacts.json` records what `haus artifact pull`/`push` last exchanged with the drive
 * for files under its directory, so a push is checked against the revision it started from.
 * The nearest manifest at or above a file owns it.
 */
export const ARTIFACT_MANIFEST_NAME = '.haus-artifacts.json';

const entrySchema = z
    .object({
        artifact_id: z.string().min(1),
        path: z.string().min(1),
        revision_id: z.string().min(1),
        sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict();
const manifestSchema = z
    .object({
        /** The drive folder this directory mirrors, when it came from a folder pull or push. */
        folder: z.string().nullable(),
        files: z.record(z.string(), entrySchema),
        version: z.literal(1),
    })
    .strict();
export type ArtifactManifestEntry = z.infer<typeof entrySchema>;
export type ArtifactManifestData = z.infer<typeof manifestSchema>;

export interface ArtifactManifest {
    data: ArtifactManifestData;
    /** The manifest file. */
    file: string;
    /** The directory the manifest's relative keys start from. */
    root: string;
}

/** Loads the nearest manifest at or above `directory`, or null when none exists. */
export async function findArtifactManifest(directory: string): Promise<ArtifactManifest | null> {
    let current = path.resolve(directory);
    for (;;) {
        const file = path.join(current, ARTIFACT_MANIFEST_NAME);
        const stat = await fs.lstat(file).catch(() => null);
        if (stat?.isFile()) {
            return { data: await readManifest(file), file, root: current };
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}

/** The nearest manifest, or a new empty one rooted at `fallbackRoot`. */
export async function openArtifactManifest(
    directory: string,
    fallbackRoot: string,
    folder: string | null
): Promise<ArtifactManifest> {
    const found = await findArtifactManifest(directory);
    if (found) {
        return found;
    }
    const root = path.resolve(fallbackRoot);
    return {
        data: { folder, files: {}, version: 1 },
        file: path.join(root, ARTIFACT_MANIFEST_NAME),
        root,
    };
}

/** The manifest key for a local file: its `/`-separated path relative to the manifest root. */
export function manifestKey(manifest: ArtifactManifest, localFile: string): string {
    return path.relative(manifest.root, path.resolve(localFile)).split(path.sep).join('/');
}

export function manifestEntryFor(
    manifest: ArtifactManifest,
    localFile: string,
    drivePath?: string
): ArtifactManifestEntry | undefined {
    const entry = manifest.data.files[manifestKey(manifest, localFile)];
    if (
        entry &&
        drivePath !== undefined &&
        artifactPathKey(entry.path) !== artifactPathKey(drivePath)
    ) {
        return undefined;
    }
    return entry;
}

/** Records one file and writes the whole manifest atomically (temp file + rename). */
export async function recordArtifactManifestEntry(
    manifest: ArtifactManifest,
    localFile: string,
    entry: ArtifactManifestEntry | null
): Promise<void> {
    const key = manifestKey(manifest, localFile);
    if (entry) {
        manifest.data.files[key] = entry;
    } else {
        delete manifest.data.files[key];
    }
    await writeArtifactManifest(manifest);
}

export async function writeArtifactManifest(manifest: ArtifactManifest): Promise<void> {
    const sorted = Object.fromEntries(
        Object.entries(manifest.data.files).sort(([a], [b]) => a.localeCompare(b))
    );
    const body = `${JSON.stringify({ ...manifest.data, files: sorted }, null, 2)}\n`;
    await writeFileAtomic(manifest.file, body);
}

/** Writes through a sibling temp file so a crash never leaves a torn file behind. */
export async function writeFileAtomic(file: string, body: string | Uint8Array): Promise<void> {
    const temp = `${file}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`;
    try {
        await fs.writeFile(temp, body, { flag: 'wx' });
        await fs.rename(temp, file);
    } catch (error) {
        await fs.rm(temp, { force: true });
        throw error;
    }
}

async function readManifest(file: string): Promise<ArtifactManifestData> {
    let raw: unknown;
    try {
        raw = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch {
        throw corrupt(file);
    }
    const parsed = manifestSchema.safeParse(raw);
    if (!parsed.success) {
        throw corrupt(file);
    }
    return parsed.data;
}

function corrupt(file: string) {
    return new AgentCliError('INVALID_ARG', `${file} is not a readable artifact manifest.`, {
        nextAction:
            'Pull the folder again into a fresh directory; do not edit .haus-artifacts.json by hand.',
    });
}
