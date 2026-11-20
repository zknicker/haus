import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

export type HearingPlace = 'channel' | 'reply' | 'task';

export interface Hearer {
    follows: boolean;
    home: boolean;
    mentioned: boolean;
}

const hearingRules: Record<HearingPlace, (hearer: Hearer, participated: boolean) => boolean> = {
    channel: ({ home, mentioned }) => home || mentioned,
    reply: ({ follows, home, mentioned }, participated) =>
        mentioned || (participated ? follows : home),
    task: ({ follows, home, mentioned }) => home || mentioned || follows,
};

export function hears(place: HearingPlace, hearer: Hearer, participated = false) {
    return hearingRules[place](hearer, participated);
}

export async function listHearingCandidates(db: Pick<HausDatabase, 'select'>, serverId: string) {
    return await db
        .select({
            handle: agentsTable.handle,
            homeProjectId: agentsTable.homeProjectId,
            id: agentsTable.id,
        })
        .from(agentsTable)
        .where(and(eq(agentsTable.serverId, serverId), isNull(agentsTable.retiredAt)))
        .orderBy(asc(agentsTable.createdAt), asc(agentsTable.id));
}

export async function listHomeAgents(
    db: Pick<HausDatabase, 'select'>,
    input: { projectId: string; serverId: string }
) {
    return (await listHearingCandidates(db, input.serverId)).filter(
        (agent) => agent.homeProjectId === input.projectId
    );
}
