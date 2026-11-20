import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatsTable } from '../postgres/schema.ts';

export type HearingPlace = 'channel' | 'reply' | 'task';

export interface Hearer {
    follows: boolean;
    mentioned: boolean;
    projectHearer: boolean;
}

const hearingRules: Record<HearingPlace, (hearer: Hearer, participated: boolean) => boolean> = {
    channel: ({ mentioned, projectHearer }) => projectHearer || mentioned,
    reply: ({ follows, mentioned, projectHearer }, participated) =>
        mentioned || (participated ? follows : projectHearer),
    task: ({ follows, mentioned, projectHearer }) => projectHearer || mentioned || follows,
};

export function hears(place: HearingPlace, hearer: Hearer, participated = false) {
    return hearingRules[place](hearer, participated);
}

export function projectHearers<Agent extends { generalist: boolean; homeProjectId: string }>(
    agents: readonly Agent[],
    projectId: string
) {
    const home = agents.filter((agent) => agent.homeProjectId === projectId);
    return home.length > 0 ? home : agents.filter((agent) => agent.generalist);
}

export async function listHearingCandidates(db: Pick<HausDatabase, 'select'>, serverId: string) {
    return await db
        .select({
            generalist: chatsTable.isAll,
            handle: agentsTable.handle,
            homeProjectId: agentsTable.homeProjectId,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, agentsTable.serverId),
                eq(chatsTable.id, agentsTable.homeProjectId)
            )
        )
        .where(and(eq(agentsTable.serverId, serverId), isNull(agentsTable.retiredAt)))
        .orderBy(asc(agentsTable.createdAt), asc(agentsTable.id));
}

export async function listProjectHearers(
    db: Pick<HausDatabase, 'select'>,
    input: { projectId: string; serverId: string }
) {
    return projectHearers(await listHearingCandidates(db, input.serverId), input.projectId);
}

export async function listHomeAgents(
    db: Pick<HausDatabase, 'select'>,
    input: { projectId: string; serverId: string }
) {
    return (await listHearingCandidates(db, input.serverId)).filter(
        (agent) => agent.homeProjectId === input.projectId
    );
}
