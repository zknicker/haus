import { and, asc, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';

export type HearingPlace = 'channel' | 'reply' | 'task';

export interface Hearer {
    follows: boolean;
    home: boolean;
    mentioned: boolean;
}

const hearsFollowedPlace = ({ follows, home, mentioned }: Hearer) => home || mentioned || follows;

const hearingRules: Record<HearingPlace, (hearer: Hearer) => boolean> = {
    channel: ({ home, mentioned }) => home || mentioned,
    reply: hearsFollowedPlace,
    task: hearsFollowedPlace,
};

export function hears(place: HearingPlace, hearer: Hearer) {
    return hearingRules[place](hearer);
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

export async function isHomeAgent(
    db: Pick<HausDatabase, 'select'>,
    agent: { agentId: string; serverId: string },
    projectId: string
) {
    return (await listHomeAgents(db, { projectId, serverId: agent.serverId })).some(
        (home) => home.id === agent.agentId
    );
}
