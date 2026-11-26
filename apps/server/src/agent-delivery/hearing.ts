import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';

export type HearingPlace = 'channel' | 'reply' | 'task';

export interface Hearer {
    ambient: boolean;
    follows: boolean;
    mentioned: boolean;
}

const hearingRules: Record<HearingPlace, (hearer: Hearer) => boolean> = {
    channel: ({ ambient, mentioned }) => ambient || mentioned,
    reply: ({ ambient, follows, mentioned }) => ambient || mentioned || follows,
    task: ({ follows, mentioned }) => mentioned || follows,
};

const hearingCandidatesAreCaptains = eq(agentsTable.kind, 'captain');

export function hears(place: HearingPlace, hearer: Hearer) {
    return hearingRules[place](hearer);
}

export function hearersOf<Agent extends { homeProjectId: string | null }>(
    agents: readonly Agent[],
    place: { isAll: boolean; projectId: string }
) {
    return place.isAll ? agents : agents.filter((agent) => agent.homeProjectId === place.projectId);
}

export async function listHearingCandidates(db: Pick<HausDatabase, 'select'>, serverId: string) {
    return await db
        .select({
            handle: agentsTable.handle,
            homeProjectId: agentsTable.homeProjectId,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, serverId),
                isNull(agentsTable.retiredAt),
                hearingCandidatesAreCaptains
            )
        )
        .orderBy(asc(agentsTable.createdAt), asc(agentsTable.id));
}

export async function listHearers(
    db: Pick<HausDatabase, 'select'>,
    input: { projectId: string; serverId: string }
) {
    const candidates = await listHearingCandidates(db, input.serverId);
    return hearersOf(candidates, await readHearingPlace(db, input));
}

export async function isHearer(
    db: Pick<HausDatabase, 'select'>,
    agent: { agentId: string; serverId: string },
    projectId: string
) {
    return (await listHearers(db, { projectId, serverId: agent.serverId })).some(
        (hearer) => hearer.id === agent.agentId
    );
}

export async function readHearingPlace(
    db: Pick<HausDatabase, 'select'>,
    input: { projectId: string; serverId: string }
) {
    const [chat] = await db
        .select({ isAll: chatsTable.isAll })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.projectId)))
        .limit(1);
    return { isAll: chat?.isAll === true, projectId: input.projectId };
}

export async function listHomeAgents(
    db: Pick<HausDatabase, 'select'>,
    input: { projectId: string; serverId: string }
) {
    return (await listHearingCandidates(db, input.serverId)).filter(
        (agent) => agent.homeProjectId === input.projectId
    );
}
