import type { Agent } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { HausUser } from '../users/haus-user.ts';
import { queryAgents } from './query-agents.ts';

export async function getAgent(
    db: HausDatabase,
    member: HausUser | null,
    serverId: string,
    agentId: string
): Promise<Agent | null> {
    return (await queryAgents(db, member, serverId, agentId))[0] ?? null;
}
