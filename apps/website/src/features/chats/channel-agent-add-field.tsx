import { ComboBox, EmptyState, Input, Label, ListBox } from '@heroui/react';
import * as React from 'react';
import { ComboBoxStateContext } from 'react-aria-components';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import type { ChannelAgentOption } from './channel-agent-picker.tsx';

/**
 * The one way an Agent joins a channel: type a name, pick it, type the next.
 *
 * A ComboBox rather than an Autocomplete because the field itself is the search
 * box — an Autocomplete is a select whose popover holds the search, and its
 * value lives in the trigger as tags. Here the chosen Agents are a roster below,
 * so the field has nothing to display and everything to filter.
 *
 * It is an add action, not a value: `selectedKey` stays null so the field is
 * never "holding" an Agent. Controlling both `selectedKey` and `inputValue` is
 * what makes that work — React Aria then leaves the input text to us instead of
 * writing the picked name back into it (`useComboBoxState`: "it's the user's
 * responsibility to update inputValue in onSelectionChange"). Focus stays on the
 * input the whole time, so the next name can be typed straight away.
 */
export function ChannelAgentAddField({
    agents,
    isDisabled,
    label,
    onAdd,
}: {
    /** Only the Agents not already in the roster. */
    agents: ChannelAgentOption[];
    isDisabled: boolean;
    /**
     * The group's own `Label` when it draws one, so the field keeps HeroUI's
     * label-to-control rhythm and the label points at the input. Without one
     * the field announces its own name instead.
     */
    label: React.ReactNode;
    onAdd: (agentId: string) => void;
}) {
    const [query, setQuery] = React.useState('');
    const isExhausted = agents.length === 0;

    return (
        <ComboBox
            allowsEmptyCollection={!isExhausted}
            aria-label={label === null ? addFieldLabel : undefined}
            fullWidth
            inputValue={query}
            isDisabled={isDisabled || isExhausted}
            onInputChange={setQuery}
            // Committing a selection, reverting, and blurring all land here.
            // Clearing first is what empties the field after an add and drops a
            // half-typed name when the field is left.
            onSelectionChange={(agentId) => {
                setQuery('');
                if (agentId !== null) {
                    onAdd(String(agentId));
                }
            }}
            selectedKey={null}
            variant="secondary"
        >
            <CloseExhaustedAgentMenu isExhausted={isExhausted} />
            {label}
            <ComboBox.InputGroup>
                <Input placeholder={isExhausted ? 'All agents added' : 'Add an agent…'} />
                <ComboBox.Trigger />
            </ComboBox.InputGroup>
            <ComboBox.Popover>
                {/* The stock filter is a case- and accent-insensitive contains,
                    so typing narrows without a custom filter. */}
                <ListBox
                    items={agents}
                    renderEmptyState={() => <EmptyState>No agents match.</EmptyState>}
                >
                    {(agent) => (
                        <ListBox.Item id={agent.id} key={agent.id} textValue={agent.name}>
                            <EntityAvatar name={agent.name} size="sm" src={agent.avatarUrl} />
                            <Label>{agent.name}</Label>
                        </ListBox.Item>
                    )}
                </ListBox>
            </ComboBox.Popover>
        </ComboBox>
    );
}

const addFieldLabel = 'Add an agent';

function CloseExhaustedAgentMenu({ isExhausted }: { isExhausted: boolean }) {
    const state = React.useContext(ComboBoxStateContext);
    React.useEffect(() => {
        // React Aria keeps manually opened menus open even when their collection empties.
        if (isExhausted && state?.isOpen) {
            state.close();
        }
    }, [isExhausted, state]);
    return null;
}
