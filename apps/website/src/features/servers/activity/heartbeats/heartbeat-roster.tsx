import type * as React from 'react';
import { EntityAvatar, identityMarkRadius } from '../../../../components/ui/entity-avatar.tsx';
import { cn } from '../../../../lib/utils.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import type { RosterEntry, RosterRing } from './heartbeat-roster-model.ts';

const avatarSize = 52;
/** The ring's band and the gap between ring and avatar, in px. */
const ringWidth = 3;
const ringGap = 2;

/**
 * Every Agent as a story-ring avatar with a one-line status, first "Everyone".
 * An accent ring has new noticed posts today, a dream ring dreamed last night,
 * a neutral ring is quiet. It is the feed's Agent filter: pressing an Agent
 * narrows the feed to it, pressing it again returns to everyone.
 */
export function HeartbeatRoster({
    agents,
    entries,
    onSelect,
    selected,
}: {
    agents: readonly ActivityLogAgent[];
    entries: readonly RosterEntry[];
    onSelect: (agentIds: readonly string[]) => void;
    selected: readonly string[];
}) {
    const byId = new Map(entries.map((entry) => [entry.agentId, entry]));
    return (
        <nav
            aria-label="Agents"
            className="flex items-start gap-4 overflow-x-auto px-1 pt-5 pb-4 [scrollbar-width:none]"
        >
            <RosterItem
                isSelected={selected.length === 0}
                label="Everyone"
                onPress={() => onSelect([])}
                ring="all"
                status={agents.length === 1 ? '1 Agent' : `${agents.length} Agents`}
            >
                <span
                    className="grid place-items-center bg-surface-secondary font-semibold text-foreground text-sm"
                    style={{
                        borderRadius: identityMarkRadius(avatarSize),
                        height: avatarSize,
                        width: avatarSize,
                    }}
                >
                    All
                </span>
            </RosterItem>
            {agents.map((agent) => {
                const entry = byId.get(agent.id);
                const isSelected = selected.length === 1 && selected[0] === agent.id;
                return (
                    <RosterItem
                        isLive={entry?.isLive}
                        isSelected={isSelected}
                        key={agent.id}
                        label={agent.displayName}
                        onPress={() => onSelect(isSelected ? [] : [agent.id])}
                        ring={entry?.ring ?? 'quiet'}
                        status={entry?.status ?? 'No check-ins yet'}
                    >
                        <EntityAvatar
                            name={agent.displayName}
                            size={avatarSize}
                            src={agent.avatarUrl}
                        />
                    </RosterItem>
                );
            })}
        </nav>
    );
}

function RosterItem({
    children,
    isLive = false,
    isSelected,
    label,
    onPress,
    ring,
    status,
}: {
    children: React.ReactNode;
    isLive?: boolean;
    isSelected: boolean;
    label: string;
    onPress: () => void;
    ring: RosterRing | 'all';
    status: string;
}) {
    const inner = identityMarkRadius(avatarSize);
    return (
        <button
            aria-pressed={isSelected}
            className="grid w-[4.75rem] shrink-0 cursor-(--cursor-interactive) content-start justify-items-center gap-1.5 rounded-lg text-center"
            onClick={onPress}
            type="button"
        >
            <span
                className={cn('grid', ringStyles[ring], isSelected && 'ring-2 ring-foreground')}
                style={{
                    borderRadius: `calc(${inner} + ${ringGap + ringWidth}px)`,
                    padding: ringWidth,
                }}
            >
                <span
                    className="grid bg-background"
                    style={{ borderRadius: `calc(${inner} + ${ringGap}px)`, padding: ringGap }}
                >
                    {children}
                </span>
            </span>
            <span className="max-w-full truncate font-semibold text-xs">{label}</span>
            <span
                className={cn(
                    'line-clamp-2 text-muted text-xs leading-tight',
                    isLive && 'text-accent motion-safe:animate-pulse'
                )}
            >
                {status}
            </span>
        </button>
    );
}

const ringStyles: Record<RosterRing | 'all', string> = {
    all: 'bg-separator',
    dream: 'bg-dream',
    new: 'bg-accent',
    quiet: 'bg-separator',
};
