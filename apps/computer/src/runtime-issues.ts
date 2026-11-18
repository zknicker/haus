import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { type ComputerInventory, computerRuntimeCatalog } from '@haus/api';
import { Effect } from 'effect';
import * as z from 'zod';
import type { DaemonRuntime } from './daemon-runtime.ts';
import type { RuntimeFailureKind } from './runtime-failure.ts';

const observationSchema = z.object({
    checkedAt: z.iso.datetime(),
    issue: z.literal('authentication').nullable(),
});
const writes = new Map<string, Promise<void>>();

/** Shared host credentials make authentication an issue of this Computer's runtime. */
export async function recordRuntimeOutcome(input: {
    dataRoot: string;
    runtimeId: string;
    startedAt: string;
    status: 'completed' | 'failed' | 'interrupted';
    failureKind?: RuntimeFailureKind;
}) {
    if (input.status !== 'completed' && input.failureKind !== 'authentication') {
        return;
    }
    await recordRuntimeAuthentication({
        dataRoot: input.dataRoot,
        runtimeId: input.runtimeId,
        checkedAt: input.startedAt,
        issue: input.failureKind === 'authentication' ? 'authentication' : null,
    });
}

export async function recordRuntimeAuthentication(input: {
    dataRoot: string;
    runtimeId: string;
    checkedAt: string;
    issue: 'authentication' | null;
}) {
    if (!computerRuntimeCatalog.some(({ id }) => id === input.runtimeId)) {
        return;
    }
    const root = join(input.dataRoot, 'runtime-health');
    const path = join(root, `${input.runtimeId}.json`);
    const previous = writes.get(path) ?? Promise.resolve();
    const work = previous
        .catch(() => undefined)
        .then(async () => {
            const current = await readObservation(path);
            if (
                current &&
                (current.checkedAt > input.checkedAt ||
                    (current.checkedAt === input.checkedAt &&
                        current.issue === 'authentication' &&
                        input.issue === null))
            ) {
                return;
            }
            await mkdir(root, { recursive: true });
            const temporary = `${path}.${crypto.randomUUID()}.tmp`;
            await writeFile(
                temporary,
                JSON.stringify({
                    checkedAt: input.checkedAt,
                    issue: input.issue,
                }),
                { mode: 0o600 }
            );
            await rename(temporary, path);
        });
    writes.set(path, work);
    try {
        await work;
    } finally {
        if (writes.get(path) === work) {
            writes.delete(path);
        }
    }
}

export async function readRuntimeIssues(
    dataRoot: string
): Promise<NonNullable<ComputerInventory['runtimeIssues']>> {
    const observations = await Promise.all(
        computerRuntimeCatalog.map(async ({ id }) => {
            const value = await readObservation(join(dataRoot, 'runtime-health', `${id}.json`));
            return value?.issue
                ? { runtimeId: id, kind: value.issue, observedAt: value.checkedAt }
                : null;
        })
    );
    return observations.filter((value): value is NonNullable<typeof value> => value !== null);
}

async function readObservation(path: string) {
    try {
        return observationSchema.parse(JSON.parse(await readFile(path, 'utf8')));
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}

export function reportRuntimeOutcome(
    input: Parameters<typeof recordRuntimeOutcome>[0],
    runtime: DaemonRuntime
) {
    return recordRuntimeOutcome(input).catch(() =>
        runtime.runPromise(Effect.logError('Could not persist runtime authentication status.'))
    );
}
