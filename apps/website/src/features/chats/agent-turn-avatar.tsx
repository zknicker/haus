import type * as React from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { useOpenAgentProfile } from '../../hooks/agents/use-open-agent-profile.ts';
import { cn } from '../../lib/utils.ts';
import { AgentAvatar } from '../members/agent-avatar.tsx';
import { AgentHoverCard } from '../members/agent-hover-card.tsx';
import { agentProfilePlacement } from '../members/agent-profile-link.tsx';
import { transcriptTurnGeometry } from './chat-transcript-turn-geometry.ts';
import type { TranscriptActorProfile } from './transcript-contract.ts';

/**
 * Agents and people share one identity mark: the uploaded square image when
 * there is one, initials otherwise.
 *
 * EntityAvatar rather than `ChatMessage.Avatar`, which takes no size and
 * hardcodes HeroUI's `md` preset. `md` rounds at `--radius * 3` while `sm` —
 * what the live-Agent path renders at 32px — rounds at `* 2`, so the two sat
 * side by side in the same column with visibly different corners at any
 * radius. One component and one preset is what actually keeps them identical.
 */
export function TurnAvatar({
    avatarUrl,
    deleted = false,
    name,
}: {
    avatarUrl?: string | null;
    deleted?: boolean;
    name: string;
}) {
    return (
        <EntityAvatar
            className={cn(transcriptTurnGeometry.avatar, deleted && 'opacity-50 grayscale')}
            name={name}
            size={32}
            src={avatarUrl}
        />
    );
}

function AgentTurnAvatar({
    profile,
    name,
}: {
    profile: TranscriptActorProfile | null;
    name: string;
}) {
    if (profile?.availability.kind === 'live') {
        return (
            <AgentAvatar
                agent={{
                    availability: profile.availability.value,
                    avatarUrl: profile.avatarUrl,
                    displayName: name,
                    id: profile.id,
                }}
                className={transcriptTurnGeometry.avatar}
                size={32}
            />
        );
    }

    return <TurnAvatar avatarUrl={profile?.avatarUrl} deleted={profile?.deleted} name={name} />;
}
export function AgentTurnProfileAvatar({
    actorId,
    chatId,
    displayName,
    opensAgentProfile,
    profile,
    serverId,
}: {
    actorId: string | null;
    chatId?: string;
    displayName: string;
    opensAgentProfile: boolean;
    profile: TranscriptActorProfile | null;
    serverId?: string;
}) {
    const avatar = <AgentTurnAvatar name={displayName} profile={profile} />;
    if (!(chatId && actorId && opensAgentProfile) || profile?.deleted) {
        return avatar;
    }

    const trigger = (
        <AgentTurnProfileButton agentId={actorId} displayName={displayName}>
            {avatar}
        </AgentTurnProfileButton>
    );

    return serverId && profile?.kind === 'agent' ? (
        <AgentHoverCard agentId={actorId} agentName={displayName} serverId={serverId}>
            {trigger}
        </AgentHoverCard>
    ) : (
        trigger
    );
}

// Hover glances (AgentHoverCard); click opens the profile (ADR 0038).
function AgentTurnProfileButton({
    agentId,
    children,
    displayName,
}: {
    agentId: string;
    children: React.ReactNode;
    displayName: string;
}) {
    const openAgentProfile = useOpenAgentProfile();
    return (
        <button
            aria-label={`Open ${displayName}'s profile`}
            className="shrink-0 cursor-(--cursor-interactive) self-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={(event) =>
                openAgentProfile(agentId, { placement: agentProfilePlacement(event) })
            }
            type="button"
        >
            {children}
        </button>
    );
}
