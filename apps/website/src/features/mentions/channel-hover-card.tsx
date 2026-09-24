import type { Agent } from '@haus/api';
import type { ServerMember } from '@haus/api/membership';
import type * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useChat } from '../../hooks/servers/use-chat.ts';
import { useMembers } from '../../hooks/servers/use-members.ts';
import { formatRelativeTime } from '../../lib/format.ts';
import { humanDisplayName } from '../servers/human-identity.ts';
import type { MentionAppearance } from './mention-appearance.tsx';
import { ReferencePreviewHeader, ReferencePreviewMark } from './reference-preview-header.tsx';

export interface ChannelParticipantPreview {
    avatarUrl: null | string;
    id: string;
    name: string;
}

const visibleParticipantCount = 5;

export function ChannelHoverCard({
    appearance,
    chatId,
    children,
    displayLabel,
    serverId,
}: {
    appearance: MentionAppearance;
    chatId: string;
    children: React.ReactNode;
    displayLabel: string;
    serverId: string;
}) {
    return (
        <CursorHoverCard
            className="w-fit max-w-72"
            content={
                <LiveChannelHoverCardContent
                    appearance={appearance}
                    chatId={chatId}
                    displayLabel={displayLabel}
                    serverId={serverId}
                />
            }
        >
            {children}
        </CursorHoverCard>
    );
}

function LiveChannelHoverCardContent({
    appearance,
    chatId,
    displayLabel,
    serverId,
}: {
    appearance: MentionAppearance;
    chatId: string;
    displayLabel: string;
    serverId: string;
}) {
    const chat = useChat(serverId, chatId);
    const agents = useAgents(serverId);
    const members = useMembers(serverId);
    const value = chat.data?.kind === 'channel' ? chat.data : null;
    const activityLabel = value?.lastActivityAt
        ? `Active ${formatRelativeTime(value.lastActivityAt)}`
        : null;
    const participants = resolveChannelParticipants({
        agentIds: value?.participantAgentIds ?? [],
        agents: agents.data ?? [],
        members: members.data?.members ?? [],
        userIds: value?.participantUserIds ?? [],
    });

    return (
        <ChannelHoverCardContent
            activityLabel={activityLabel}
            appearance={appearance}
            displayLabel={displayLabel}
            participants={participants}
        />
    );
}

export function ChannelHoverCardContent({
    activityLabel,
    appearance,
    displayLabel,
    participants,
}: {
    activityLabel: string | null;
    appearance: MentionAppearance;
    displayLabel: string;
    participants: readonly ChannelParticipantPreview[];
}) {
    const title = displayLabel.startsWith('#') ? displayLabel : `#${displayLabel}`;

    return (
        <ReferencePreviewHeader
            mark={<ReferencePreviewMark appearance={appearance} />}
            meta={activityLabel}
            title={title}
        >
            {participants.length > 0 ? (
                <ChannelParticipantStack participants={participants} />
            ) : null}
        </ReferencePreviewHeader>
    );
}

function ChannelParticipantStack({
    participants,
}: {
    participants: readonly ChannelParticipantPreview[];
}) {
    const visible = participants.slice(0, visibleParticipantCount);
    const remaining = participants.length - visible.length;

    return (
        <div className="haus-hover-card__faces flex min-w-0 items-center">
            <ul aria-label="Channel members" className="m-0 flex shrink-0 list-none -space-x-2 p-0">
                {visible.map((participant) => (
                    <li key={participant.id}>
                        <EntityAvatar
                            name={participant.name}
                            size={20}
                            src={participant.avatarUrl}
                        />
                    </li>
                ))}
            </ul>
            {remaining > 0 ? (
                <span className="ms-2 shrink-0 font-medium text-muted text-xs">+{remaining}</span>
            ) : null}
        </div>
    );
}

function resolveChannelParticipants({
    agentIds,
    agents,
    members,
    userIds,
}: {
    agentIds: readonly string[];
    agents: readonly Agent[];
    members: readonly ServerMember[];
    userIds: readonly string[];
}): ChannelParticipantPreview[] {
    const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
    const membersById = new Map(members.map((member) => [member.userId, member]));
    const humanPreviews = userIds.map((userId) => {
        const member = membersById.get(userId);
        return {
            avatarUrl: member?.avatarUrl ?? null,
            id: userId,
            name: member ? humanDisplayName(member) : `Human ${userId.slice(-6)}`,
        };
    });
    const agentPreviews = agentIds.map((agentId) => {
        const agent = agentsById.get(agentId);
        return {
            avatarUrl: agent?.avatarUrl ?? null,
            id: agentId,
            name: agent?.displayName ?? `Agent ${agentId.slice(-6)}`,
        };
    });

    return [...humanPreviews, ...agentPreviews];
}
