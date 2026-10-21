import type { Key, Selection } from '@heroui/react';
import { Tag, TagGroup } from '@heroui/react';
import { EntityAvatar } from '../../../../components/ui/entity-avatar.tsx';
import { cn } from '../../../../lib/utils.ts';
import type { ActivityLogAgent } from '../../../members/agent-profile/agent-activity-log-entries.ts';
import type { RosterEntry, RosterSignal } from './heartbeat-roster-model.ts';

const avatarSize = 20;
const everyoneKey = 'everyone';

/**
 * The feed's Agent filter as a compact row of pills, first "Everyone", then one
 * per Agent. A tiny dot on the avatar says what is new: accent for noticed posts
 * today, dream violet for a dream last night, pulsing while a check-in runs.
 * Pressing an Agent narrows the feed to it; "Everyone" returns to all.
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
    const selectedKey = selected.length === 1 ? (selected[0] ?? everyoneKey) : everyoneKey;
    return (
        <TagGroup
            aria-label="Agents"
            className="pt-5 pb-3"
            disallowEmptySelection
            onSelectionChange={(keys) => onSelect(readAgentIds(keys))}
            selectedKeys={[selectedKey]}
            selectionMode="single"
            size="sm"
            variant="surface"
        >
            <TagGroup.List className="flex-nowrap overflow-x-auto [scrollbar-width:none]">
                <Tag id={everyoneKey}>Everyone</Tag>
                {agents.map((agent) => {
                    const entry = byId.get(agent.id);
                    return (
                        <Tag id={agent.id} key={agent.id} textValue={agent.displayName}>
                            <span className="relative flex-none">
                                <EntityAvatar
                                    name={agent.displayName}
                                    size={avatarSize}
                                    src={agent.avatarUrl}
                                />
                                <SignalDot
                                    isLive={entry?.isLive}
                                    signal={entry?.signal ?? 'none'}
                                />
                            </span>
                            {agent.displayName}
                        </Tag>
                    );
                })}
            </TagGroup.List>
        </TagGroup>
    );
}

function SignalDot({ isLive = false, signal }: { isLive?: boolean; signal: RosterSignal }) {
    if (signal === 'none' && !isLive) {
        return null;
    }
    return (
        <span
            aria-hidden="true"
            className={cn(
                'absolute -right-0.5 -bottom-0.5 box-content size-1.5 flex-none rounded-full border-2 border-background',
                signal === 'dream' ? 'bg-dream' : 'bg-accent',
                isLive && 'motion-safe:animate-pulse'
            )}
        />
    );
}

/** A selection of nothing or "Everyone" is every Agent; otherwise the one Agent. */
function readAgentIds(keys: Selection): readonly string[] {
    if (keys === 'all') {
        return [];
    }
    const [key]: Key[] = [...keys];
    return key === undefined || key === everyoneKey ? [] : [String(key)];
}
