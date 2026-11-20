import {
    type WorkerPlace,
    type WorkerPlaceInput,
    isCloudWorkerPlace,
    parseWorkerPlace,
} from '@haus/api';
import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { projectsTable } from '../postgres/schema.ts';
import {
    type ComputerPlace,
    isComputerPlaceUsable,
    readComputerPlaces,
} from './computer-places.ts';
import { WorkerPlaceAmbiguousError, WorkerPlaceUnknownError } from './place-errors.ts';
import { readReadyPlaces } from './worker-carrier.ts';

type Reader = Pick<HausDatabase, 'select'>;

const computerPrefix = 'computer:';

export async function resolveRequestedPlace(
    db: Reader,
    serverId: string,
    requested: WorkerPlaceInput | undefined
) {
    if (requested === undefined) {
        return null;
    }
    const parsed = typeof requested === 'object' ? requested : parseWorkerPlace(requested);
    if (parsed && isCloudWorkerPlace(parsed)) {
        return parsed;
    }
    const computers = await readComputerPlaces(db, serverId);
    const text = typeof requested === 'object' ? '' : requested.trim();
    const named = text.startsWith(computerPrefix) ? text.slice(computerPrefix.length) : text;
    const computerId = parsed?.kind === 'computer' ? parsed.computerId : named;
    const byId = computers.find((computer) => computer.computerId === computerId);
    if (byId) {
        return { computerId: byId.computerId, kind: 'computer' } satisfies WorkerPlace;
    }
    const byName = computers.filter(
        (computer) => computer.name?.toLowerCase() === named.toLowerCase()
    );
    const [only, ...others] = byName;
    if (!only) {
        throw new WorkerPlaceUnknownError(text || `computer:${computerId}`);
    }
    if (others.length > 0) {
        throw new WorkerPlaceAmbiguousError(
            named,
            byName.map((computer) => computer.computerId)
        );
    }
    return { computerId: only.computerId, kind: 'computer' } satisfies WorkerPlace;
}

export async function readProjectDefaultPlace(db: Reader, serverId: string, projectId: string) {
    const [project] = await db
        .select({
            computerId: projectsTable.defaultWorkerComputerId,
            place: projectsTable.defaultWorkerPlace,
        })
        .from(projectsTable)
        .where(and(eq(projectsTable.serverId, serverId), eq(projectsTable.chatId, projectId)))
        .limit(1);
    if (!project?.place) {
        return null;
    }
    if (project.place === 'computer') {
        if (!project.computerId) {
            throw new Error(`Project ${projectId} defaults to a Computer it does not name.`);
        }
        return { computerId: project.computerId, kind: 'computer' } satisfies WorkerPlace;
    }
    return { kind: project.place } satisfies WorkerPlace;
}

export async function readUsablePlaces(db: Reader, serverId: string) {
    const computers = await readComputerPlaces(db, serverId);
    return [
        ...(await readReadyPlaces(db, serverId)),
        ...computers
            .filter(isComputerPlaceUsable)
            .map(
                (computer: ComputerPlace) =>
                    ({ computerId: computer.computerId, kind: 'computer' }) satisfies WorkerPlace
            ),
    ] satisfies WorkerPlace[];
}

export async function isPlaceUsable(db: Reader, serverId: string, place: WorkerPlace) {
    const usable = await readUsablePlaces(db, serverId);
    return usable.some((candidate) =>
        candidate.kind === 'computer'
            ? place.kind === 'computer' && place.computerId === candidate.computerId
            : candidate.kind === place.kind
    );
}
