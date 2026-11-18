import { Label, Spinner } from '@heroui/react';
import * as React from 'react';
import { ChannelAgentAddField } from './channel-agent-add-field.tsx';
import {
    ChannelAgentRoster,
    ChannelAgentRosterBox,
    rosterLineClassName,
} from './channel-agent-roster.tsx';

export interface ChannelAgentOption {
    avatarUrl: string | null;
    id: string;
    name: string;
}

/**
 * The roster of Agents in a channel, shared by channel creation and editing.
 *
 * A roster of every Agent on the Server does not survive its own success — this
 * dev Server already has 34 — so choosing is a search and the list below is the
 * answer, not the menu. The group is a plain region rather than a HeroUI field:
 * React Aria's ComboBox hands its trigger props to every Button beneath it, so a
 * roster of remove buttons cannot live inside one.
 */
export function ChannelAgentPicker({
    agents,
    agentsPending,
    isDisabled,
    label,
    onSelectedAgentIdsChange,
    selectedAgentIds,
}: {
    agents: ChannelAgentOption[];
    agentsPending: boolean;
    isDisabled: boolean;
    /**
     * Whether the group draws its name or only announces it. A dialog about
     * nothing but Agents already says so in its heading; a form that pairs the
     * roster with other fields has to label them apart.
     */
    label: 'visible' | 'hidden';
    onSelectedAgentIdsChange: (agentIds: string[]) => void;
    selectedAgentIds: string[];
}) {
    const emptyRosterId = React.useId();
    const labelId = React.useId();
    const rosterAgents = channelRosterAgents(agents, selectedAgentIds);
    const isRosterEmpty = !agentsPending && rosterAgents.length === 0;

    return (
        <fieldset
            aria-describedby={isRosterEmpty ? emptyRosterId : undefined}
            aria-label={label === 'hidden' ? agentGroupLabel : undefined}
            aria-labelledby={label === 'visible' ? labelId : undefined}
            className="flex min-w-0 flex-col gap-2"
        >
            <ChannelAgentAddField
                agents={channelAgentOptions(agents, selectedAgentIds)}
                isDisabled={isDisabled}
                label={label === 'visible' ? <Label id={labelId}>{agentGroupLabel}</Label> : null}
                onAdd={(agentId) =>
                    onSelectedAgentIdsChange(addChannelAgentId(selectedAgentIds, agentId))
                }
            />
            {/* One slot, one fixed height: the roster, its empty state, or the
                wait for the Agents that fill it. Swapping inside the slot is
                what keeps the dialog still. */}
            {agentsPending ? (
                <ChannelAgentRosterBox>
                    <div className={rosterLineClassName}>
                        <Spinner color="current" size="sm" />
                        Loading agents
                    </div>
                </ChannelAgentRosterBox>
            ) : (
                <ChannelAgentRoster
                    agents={rosterAgents}
                    emptyDescription={emptyRosterDescription(agents.length)}
                    emptyDescriptionId={emptyRosterId}
                    isDisabled={isDisabled}
                    onRemove={(agentId) =>
                        onSelectedAgentIdsChange(removeChannelAgentId(selectedAgentIds, agentId))
                    }
                />
            )}
        </fieldset>
    );
}

export function normalizeChannelAgentIds(agentIds: string[]) {
    return [...new Set(agentIds.map((agentId) => agentId.trim()).filter(Boolean))];
}

/** The Agents still addable: the roster is the menu's complement. */
export function channelAgentOptions(agents: ChannelAgentOption[], selectedAgentIds: string[]) {
    const selected = new Set(normalizeChannelAgentIds(selectedAgentIds));
    return agents.filter((agent) => !selected.has(agent.id));
}

/** The selected Agents in the order they were added, skipping ids we cannot name. */
export function channelRosterAgents(agents: ChannelAgentOption[], selectedAgentIds: string[]) {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    return normalizeChannelAgentIds(selectedAgentIds)
        .map((agentId) => byId.get(agentId))
        .filter((agent) => agent !== undefined);
}

export function addChannelAgentId(selectedAgentIds: string[], agentId: string) {
    return normalizeChannelAgentIds([...selectedAgentIds, agentId]);
}

export function removeChannelAgentId(selectedAgentIds: string[], agentId: string) {
    return normalizeChannelAgentIds(selectedAgentIds).filter((id) => id !== agentId);
}

const agentGroupLabel = 'Agents';

/** What the empty box asks for: the rule and its action, or why neither is on offer. */
function emptyRosterDescription(agentCount: number) {
    if (agentCount === 0) {
        return 'No agents available.';
    }
    return 'Add an agent above.';
}
