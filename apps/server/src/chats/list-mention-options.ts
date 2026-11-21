import {
    formatAgentReferenceTarget,
    formatSkillReferenceTarget,
    formatUserReferenceTarget,
    type MentionOption,
} from '@haus/api';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { listHearingCandidates } from '../agent-delivery/hearing.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, computersTable } from '../postgres/schema.ts';
import { listServerMembers } from '../servers/list-members.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireChatAccess } from './chat-access.ts';
import { listChannelMentionOptions } from './list-channel-mention-options.ts';

export async function listMentionOptions(
    db: HausDatabase,
    member: HausUser | null,
    input:
        | { agentId: string; agentIds: string[]; serverId: string; targetKind: 'agent-dm' }
        | { agentIds: string[]; chatId: string; serverId: string }
): Promise<{ options: MentionOption[] }> {
    const { participantAgentIds, skillAgentIds: defaultSkillAgentIds } =
        'agentId' in input
            ? await listImplicitDmAgentIds(db, member, input)
            : await listChatMentionAgentIds(db, member, input);
    const participantSet = new Set(participantAgentIds);
    const skillAgentIds =
        input.agentIds.length > 0
            ? input.agentIds.filter((agentId) => participantSet.has(agentId))
            : defaultSkillAgentIds;

    const rows =
        participantAgentIds.length === 0
            ? []
            : await db
                  .select({
                      computerInventory: computersTable.reportedInventory,
                      displayName: agentsTable.displayName,
                      id: agentsTable.id,
                  })
                  .from(agentsTable)
                  .innerJoin(
                      computersTable,
                      and(
                          eq(computersTable.serverId, agentsTable.serverId),
                          eq(computersTable.id, agentsTable.computerId)
                      )
                  )
                  .where(
                      and(
                          eq(agentsTable.serverId, input.serverId),
                          inArray(agentsTable.id, participantAgentIds),
                          isNull(agentsTable.retiredAt)
                      )
                  )
                  .orderBy(agentsTable.createdAt);

    const agentOptions = rows.map((agent): MentionOption => ({
        description: 'Agent',
        id: formatAgentReferenceTarget(agent.id),
        insertText: `@${agent.displayName}`,
        kind: 'agent',
        label: agent.displayName,
        projection: 'agent-reference',
        sourceLabel: 'Agents',
    }));
    const skillScope = new Set(skillAgentIds);
    const skillOptions = new Map<string, MentionOption>();

    for (const agent of rows) {
        if (!skillScope.has(agent.id)) {
            continue;
        }
        const skills =
            agent.computerInventory?.agentSkills?.find((entry) => entry.agentId === agent.id)
                ?.skills ?? [];
        for (const skill of skills) {
            if (!skillOptions.has(skill.name)) {
                const description = skill.description.trim() || null;
                skillOptions.set(skill.name, {
                    description,
                    id: formatSkillReferenceTarget(skill.name),
                    insertText: skill.name,
                    kind: 'skill',
                    label: skill.name,
                    metadata: description ? { description } : undefined,
                    projection: 'skill-activation',
                    sourceLabel: 'Skills',
                });
            }
        }
    }

    const directory = await listServerMembers(db, member, input.serverId);
    const humanOptions = directory.members.map((human): MentionOption => {
        const label = human.displayName ?? human.handle ?? 'Member';
        return {
            description: human.handle ? `Human · @${human.handle}` : 'Human in this Server',
            id: formatUserReferenceTarget(human.userId),
            insertText: `@${label}`,
            kind: 'user',
            label,
            metadata: {
                userAvatarUrl: human.avatarUrl,
                userHandle: human.handle,
            },
            projection: 'user-reference',
            sourceLabel: 'Humans',
        };
    });

    const channelOptions = await listChannelMentionOptions(db, member, input.serverId);

    return {
        options: [...agentOptions, ...humanOptions, ...channelOptions, ...skillOptions.values()],
    };
}

async function listImplicitDmAgentIds(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; serverId: string }
) {
    await requireServerMembership(db, member, input.serverId);
    const [agent] = await db
        .select({ id: agentsTable.id })
        .from(agentsTable)
        .where(
            and(
                eq(agentsTable.serverId, input.serverId),
                eq(agentsTable.id, input.agentId),
                isNull(agentsTable.retiredAt)
            )
        )
        .limit(1);
    const ids = agent ? [agent.id] : [];
    return { participantAgentIds: ids, skillAgentIds: ids };
}

async function listChatMentionAgentIds(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId: string; serverId: string }
) {
    const chat = await requireChatAccess(db, member, input);
    if (chat.kind === 'dm') {
        const ids = chat.dmAgentId ? [chat.dmAgentId] : [];
        return { participantAgentIds: ids, skillAgentIds: ids };
    }
    const projectId = chat.kind === 'task' ? chat.parentChatId : chat.id;
    const agents = await listHearingCandidates(db, input.serverId);
    return {
        participantAgentIds: agents.map((agent) => agent.id),
        skillAgentIds: agents
            .filter((agent) => agent.homeProjectId === projectId)
            .map((agent) => agent.id),
    };
}
