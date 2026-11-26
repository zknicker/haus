import {
    workerPlaceEntrySchema,
    workerPlacesResponseSchema,
    workerRuntimeReadinessSchema,
} from '@haus/api';
import * as z from 'zod';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { taskRefArgument } from './agent-command-utils.ts';
import { defaultDeps, type WorkerDeps } from './agent-worker-deps.ts';

const [computerEntry, cursorEntry, claudeEntry] = workerPlaceEntrySchema.options;
const placesResponseSchema = z.looseObject({
    ...workerPlacesResponseSchema.shape,
    places: z
        .array(
            z.discriminatedUnion('kind', [
                z.looseObject({
                    ...computerEntry.shape,
                    allowed: z.boolean().default(true),
                    runtimes: z.array(z.looseObject(workerRuntimeReadinessSchema.shape)).max(2),
                }),
                z.looseObject(cursorEntry.shape),
                z.looseObject(claudeEntry.shape),
            ])
        )
        .max(200),
});
type PlacesResponse = z.infer<typeof placesResponseSchema>;
type PlaceEntry = PlacesResponse['places'][number];

export const PLACES_COMMAND: SubCommand = {
    examples: ['haus worker places --task k3mq7xta'],
    flags: [
        {
            description: 'Mark the Task’s Project default',
            name: '--task',
            valueName: '<id>',
        },
    ],
    name: 'places',
    notes: [
        'Name a place on start with --on: computer:<id>, a Computer name, cursor, or claude.',
        'A Worker on a Computer with no folder for its repo clones it there first.',
    ],
    positionals: [],
    run: (args) => runWorkerPlaces(args, defaultDeps()),
    summary: 'List where Workers can run, with readiness, runtimes, repo folders, and free slots',
    usage: 'haus worker places [--task <id>]',
};

export async function runWorkerPlaces(args: ParsedArgs, deps: WorkerDeps) {
    const raw = args.values['--task']?.trim();
    const task = raw ? taskRefArgument(raw, '--task') : undefined;
    const response = await deps.client.request('/api/agent/workers/places', placesResponseSchema, {
        query: { task },
    });
    deps.write(renderWorkerPlaces(response));
    return 0;
}

export function renderWorkerPlaces(response: PlacesResponse) {
    const heading = response.task ? `Places for ${response.task}:` : 'Places:';
    const start = `haus worker start --task ${response.task ?? '<id>'} --on <place> --title <text>`;
    return `${[heading, ...response.places.map(placeLine), '', `Start one with ${start}.`].join('\n')}\n`;
}

function placeLine(place: PlaceEntry) {
    const marker = place.projectDefault ? ' [Project default]' : '';
    if (place.kind !== 'computer') {
        return `${place.kind}: ${slots(place)}${marker}`;
    }
    const name = place.name ? ` ${place.name}` : '';
    const lead = `computer:${place.computerId}${name}`;
    if (!place.allowed) {
        return `${lead}: you have no access there${marker}`;
    }
    if (!place.workersEnabled) {
        return `${lead}: Run Workers here is Off${marker}`;
    }
    if (!place.online) {
        return `${lead}: offline${marker}`;
    }
    const runtimes = place.runtimes
        .map((runtime) =>
            runtime.ready
                ? runtime.runtime
                : `${runtime.runtime} (${runtime.detail ?? 'not ready'})`
        )
        .join(', ');
    const folders =
        place.repoFolders.length > 0 ? `; repo folders ${place.repoFolders.join(', ')}` : '';
    return `${lead}: ${slots(place)}; runtimes ${runtimes || 'none'}${folders}${marker}`;
}

function slots(place: { freeSlots: number; limit: number; ready: boolean }) {
    return place.ready
        ? `ready, ${place.freeSlots} of ${place.limit} slots free`
        : `not ready, ${place.freeSlots} of ${place.limit} slots free`;
}
