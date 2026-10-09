import type { Agent, AgentAvailability } from '@haus/api';
import { Badge } from '@heroui/react';
import type React from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { type AgentMark, useAgentPresence } from '../../hooks/members/use-agents.ts';
import { cn } from '../../lib/utils.ts';
import { presenceLabel } from '../computers/presentation.ts';

/** Agent availability mapped onto the stock Badge color vocabulary. */
export function availabilityBadgeColor(availability: AgentAvailability) {
    switch (availability) {
        case 'idle':
            return 'success' as const;
        case 'working':
            return 'warning' as const;
        case 'error':
            return 'danger' as const;
        case 'offline':
        case 'stopped':
            return 'default' as const;
    }
}

/**
 * Rail avatar with the agent's presence dot pinned to its corner, for a
 * surface that already holds the Agent's availability. The dot is outset past
 * the corner and ringed in the page background so it separates from the
 * avatar instead of sitting on top of it.
 */
export function AgentAvatar({
    agent,
    className,
    size = 20,
}: {
    agent: AgentMark & {
        availability: AgentAvailability;
        wakePause?: Agent['wakePause'];
    };
    className?: string;
    size?: number;
}): React.ReactElement {
    return (
        <AgentAvatarFrame agent={agent} className={className} size={size}>
            <PresenceBadge availability={agent.availability} paused={Boolean(agent.wakePause)} />
        </AgentAvatarFrame>
    );
}

/**
 * The same avatar for a surface that stays mounted while the Agent works
 * (sidebar rows, transcript turns in every kept chat view). Availability
 * flips on every turn, so the dot reads it in its own leaf and a flip repaints
 * only the dot.
 */
export function LiveAgentAvatar({
    agent,
    className,
    serverId,
    size = 20,
}: {
    agent: AgentMark;
    className?: string;
    serverId: string;
    size?: number;
}): React.ReactElement {
    return (
        <AgentAvatarFrame agent={agent} className={className} size={size}>
            <LivePresenceBadge agentId={agent.id} serverId={serverId} />
        </AgentAvatarFrame>
    );
}

function LivePresenceBadge({ agentId, serverId }: { agentId: string; serverId: string }) {
    const presence = useAgentPresence(serverId, agentId);
    return <PresenceBadge availability={presence.availability} paused={presence.paused} />;
}

function AgentAvatarFrame({
    agent,
    children,
    className,
    size,
}: {
    agent: AgentMark;
    children: React.ReactNode;
    className?: string;
    size: number;
}) {
    return (
        <Badge.Anchor
            className={className}
            data-agent-id={agent.id}
            style={{ height: size, width: size }}
        >
            <EntityAvatar name={agent.displayName} size={size} src={agent.avatarUrl} />
            {children}
        </Badge.Anchor>
    );
}

function PresenceBadge({
    availability,
    paused,
}: {
    availability: AgentAvailability;
    paused: boolean;
}) {
    return (
        <Badge
            className={cn(
                availability !== 'idle' &&
                    availability !== 'working' &&
                    availability !== 'error' &&
                    'bg-muted'
            )}
            color={availabilityBadgeColor(availability)}
            data-agent-status={availability}
            placement="bottom-right"
            size="sm"
            title={presenceLabel(availability, paused)}
        />
    );
}
