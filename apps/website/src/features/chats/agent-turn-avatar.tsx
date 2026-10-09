import type * as React from 'react';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { cn } from '../../lib/utils.ts';
import { LiveAgentAvatar } from '../members/agent-avatar.tsx';
import { AgentHoverCard } from '../members/agent-hover-card.tsx';
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
            <LiveAgentTurnAvatar
                avatarUrl={profile.avatarUrl}
                id={profile.id}
                name={name}
                serverId={profile.availability.serverId}
            />
        );
    }

    return <TurnAvatar avatarUrl={profile?.avatarUrl} deleted={profile?.deleted} name={name} />;
}
/**
 * The presence dot reads the Agent's availability itself: it flips on every
 * turn, and carrying it in the row's profile would re-render every row the
 * Agent ever wrote.
 */
function LiveAgentTurnAvatar({
    avatarUrl,
    id,
    name,
    serverId,
}: {
    avatarUrl: string | null;
    id: string;
    name: string;
    serverId: string;
}) {
    return (
        <LiveAgentAvatar
            agent={{ avatarUrl, displayName: name, id }}
            className={transcriptTurnGeometry.avatar}
            serverId={serverId}
            size={32}
        />
    );
}

export function AgentTurnProfileAvatar({
    actorId,
    chatId,
    displayName,
    openAgentProfile,
    profile,
    serverId,
}: {
    actorId: string | null;
    chatId?: string;
    displayName: string;
    openAgentProfile: ((agentId: string) => void) | undefined;
    profile: TranscriptActorProfile | null;
    serverId?: string;
}) {
    const avatar = <AgentTurnAvatar name={displayName} profile={profile} />;
    if (!(chatId && actorId && openAgentProfile) || profile?.deleted) {
        return avatar;
    }

    const trigger = (
        <AgentTurnProfileButton
            agentId={actorId}
            displayName={displayName}
            openAgentProfile={openAgentProfile}
        >
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
    openAgentProfile,
}: {
    agentId: string;
    children: React.ReactNode;
    displayName: string;
    openAgentProfile: (agentId: string) => void;
}) {
    return (
        <button
            aria-label={`Open ${displayName}'s profile`}
            className="shrink-0 cursor-(--cursor-interactive) self-start rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => openAgentProfile(agentId)}
            type="button"
        >
            {children}
        </button>
    );
}
