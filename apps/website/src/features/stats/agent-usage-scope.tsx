import { Label, ListBox, Select } from '@heroui/react';
import { UserMultiple02Icon } from '@hugeicons-pro/core-stroke-rounded';
import {
    EntityAvatar,
    type EntityAvatarProps,
    identityMarkRadius,
} from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import type { AgentUsage } from './token-usage-view.ts';

const ALL_AGENTS = 'all';

/** Rail scale: an identity mark the trigger can carry without growing around it. */
const triggerMarkSize = 20;

/**
 * Whose usage the dashboard is showing.
 *
 * This was one KPI card per Agent in an auto-fit grid — fine at two Agents, and
 * three stacked rows of cards above the chart at ten. It was also doing two
 * jobs: choosing a scope, and comparing Agents. The comparison already lives
 * further down the same page in Token usage detail, broken down by Agent,
 * runtime and model, so this keeps only the choosing — single-line rows with
 * no totals, because Token usage detail already answers "who is burning
 * tokens".
 *
 * The trigger keeps the stacked-roster mark (rail scale, so the control keeps
 * its own field height); the list swaps it for a members glyph in an
 * avatar-sized box, because a three-avatar cluster beside single avatars reads
 * as an inset row rather than a peer of the rows below it.
 */
export function AgentUsageScopePicker({
    agents,
    onSelect,
    selectedAgentId,
}: {
    agents: AgentUsage[];
    onSelect: (agentId: null | string) => void;
    selectedAgentId: null | string;
}) {
    const selected = agents.find((agent) => agent.agentId === selectedAgentId);

    return (
        <Select
            aria-label="Token usage scope"
            className="w-56"
            onChange={(value) => onSelect(value === ALL_AGENTS ? null : String(value))}
            value={selectedAgentId ?? ALL_AGENTS}
            variant="secondary"
        >
            <Select.Trigger>
                <Select.Value>
                    {() =>
                        selected ? (
                            <span className="flex min-w-0 items-center gap-2">
                                <EntityAvatar
                                    name={selected.agentName}
                                    size={triggerMarkSize}
                                    src={selected.agentAvatarUrl}
                                />
                                <span className="truncate">{selected.agentName}</span>
                            </span>
                        ) : (
                            <span className="flex min-w-0 items-center gap-2">
                                <AllAgentsMark agents={agents} size={triggerMarkSize} />
                                <span className="truncate">All Captains</span>
                            </span>
                        )
                    }
                </Select.Value>
                <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
                <ListBox>
                    <ListBox.Item id={ALL_AGENTS} textValue="All Captains">
                        <EveryAgentMark />
                        <Label>All Captains</Label>
                        <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {agents.map((agent) => (
                        <ListBox.Item
                            id={agent.agentId}
                            key={agent.agentId}
                            textValue={agent.agentName}
                        >
                            <EntityAvatar
                                name={agent.agentName}
                                size="sm"
                                src={agent.agentAvatarUrl}
                            />
                            <Label>{agent.agentName}</Label>
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    ))}
                </ListBox>
            </Select.Popover>
        </Select>
    );
}

/** The whole roster as one mark, so "everyone" reads as a face rather than a word. */
function AllAgentsMark({
    agents,
    size,
}: {
    agents: AgentUsage[];
    size: EntityAvatarProps['size'];
}) {
    return (
        <span className="flex shrink-0 -space-x-2">
            {agents.slice(0, 3).map((agent) => (
                <EntityAvatar
                    className="ring-surface ring-2"
                    key={agent.agentId}
                    name={agent.agentName}
                    size={size}
                    src={agent.agentAvatarUrl}
                />
            ))}
        </span>
    );
}

/**
 * "Everyone" for the option list: a members glyph in an avatar-sized box, on
 * the same size and radius curve as the sm avatars beside it (the
 * channel-icon-box idiom). The trigger's stacked roster reads wrong here — a
 * cluster beside single avatars makes the row look inset instead of peer.
 */
function EveryAgentMark() {
    const boxSize = 32;
    return (
        <span
            aria-hidden="true"
            className="text-muted flex shrink-0 items-center justify-center bg-[var(--default)]"
            style={{
                borderRadius: identityMarkRadius(boxSize),
                height: boxSize,
                width: boxSize,
            }}
        >
            <Icon icon={UserMultiple02Icon} size={16} style={{ height: 16, width: 16 }} />
        </span>
    );
}
