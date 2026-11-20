import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { type CloudAgentProvider, cloudAgentProviders } from './cloud-agent-provider.ts';

/** Where a Worker runs for its whole life (specs/workers.md "Places"). */
export const workerPlaceSchema = z.discriminatedUnion('kind', [
    z.object({ computerId: idSchema, kind: z.literal('computer') }).strict(),
    z.object({ kind: z.literal('cursor') }).strict(),
    z.object({ kind: z.literal('claude') }).strict(),
]);
export type WorkerPlace = z.infer<typeof workerPlaceSchema>;

/**
 * A place as the Worker record shows it: a Computer place carries the
 * Computer's reported name, so a reader never resolves it separately. Inputs,
 * frames, and storage use the plain `workerPlaceSchema`.
 */
export const workerPlaceViewSchema = z.discriminatedUnion('kind', [
    z
        .object({
            computerId: idSchema,
            computerName: z.string().trim().min(1).max(100).nullable(),
            kind: z.literal('computer'),
        })
        .strict(),
    z.object({ kind: z.literal('cursor') }).strict(),
    z.object({ kind: z.literal('claude') }).strict(),
]);
export type WorkerPlaceView = z.infer<typeof workerPlaceViewSchema>;

export const workerPlaceKinds = ['computer', ...cloudAgentProviders] as const;
export const workerPlaceKindSchema = z.enum(workerPlaceKinds);
export type WorkerPlaceKind = z.infer<typeof workerPlaceKindSchema>;

/**
 * A place as a person or the CLI writes it: `computer:<id>`, `cursor`,
 * `claude`, or a Computer name (bare or after `computer:`) the Server resolves.
 */
export const workerPlaceTextSchema = z.string().trim().min(1).max(200);

/** Start input: the place object, or any string form. */
export const workerPlaceInputSchema = z.union([workerPlaceSchema, workerPlaceTextSchema]);
export type WorkerPlaceInput = z.infer<typeof workerPlaceInputSchema>;

const computerPrefix = 'computer:';
const computerIdPattern = /^cmp_[A-Za-z0-9_-]{16}$/u;

export function formatWorkerPlace(place: WorkerPlace) {
    return place.kind === 'computer' ? `${computerPrefix}${place.computerId}` : place.kind;
}

/**
 * The exact string forms back to a place. Anything else, such as a Computer
 * name, is null: only the Server can resolve a name.
 */
export function parseWorkerPlace(text: string) {
    const trimmed = text.trim();
    if (trimmed === 'cursor' || trimmed === 'claude') {
        return { kind: trimmed } satisfies WorkerPlace;
    }
    const computerId = trimmed.startsWith(computerPrefix)
        ? trimmed.slice(computerPrefix.length)
        : null;
    return computerId && computerIdPattern.test(computerId)
        ? ({ computerId, kind: 'computer' } satisfies WorkerPlace)
        : null;
}

export function isCloudWorkerPlace(
    place: WorkerPlace
): place is Extract<WorkerPlace, { kind: CloudAgentProvider }> {
    return place.kind !== 'computer';
}

/** The provider of a cloud place, for the paths only cloud Workers reach. */
export function requireCloudWorkerPlace(place: WorkerPlace) {
    if (!isCloudWorkerPlace(place)) {
        throw new Error(`Worker place ${formatWorkerPlace(place)} is not a cloud place.`);
    }
    return place.kind;
}
