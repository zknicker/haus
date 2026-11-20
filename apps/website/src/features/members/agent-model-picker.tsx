import {
    Autocomplete,
    Description,
    EmptyState,
    Header,
    Label,
    ListBox,
    SearchField,
    ToggleButton,
} from '@heroui/react';
import { LayerIcon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { ModelAccountLogo } from '../settings/models/connections/model-account-mark.tsx';
import {
    type AgentModelOption,
    agentModelSections,
    contextWindowLabel,
} from './agent-model-options.ts';

export function AgentModelPicker({
    onPick,
    options,
    selectedKey,
}: {
    onPick: (option: AgentModelOption) => void;
    options: readonly AgentModelOption[];
    selectedKey: string;
}) {
    const [byProvider, setByProvider] = React.useState(true);
    const sections = agentModelSections(options, byProvider ? 'provider' : 'flat');
    const filter = React.useCallback(
        (textValue: string, input: string) =>
            textValue.toLowerCase().includes(input.trim().toLowerCase()),
        []
    );

    return (
        <Autocomplete
            disabledKeys={options.filter((option) => !option.connected).map((option) => option.key)}
            fullWidth
            placeholder="Choose a model"
            onChange={(key) => {
                const picked = options.find((option) => option.key === key);
                if (picked) {
                    onPick(picked);
                }
            }}
            value={selectedKey}
            variant="secondary"
        >
            <Label>Model</Label>
            <Autocomplete.Trigger>
                <Autocomplete.Value />
                <Autocomplete.Indicator />
            </Autocomplete.Trigger>
            <Autocomplete.Popover>
                <Autocomplete.Filter filter={filter}>
                    <div className="flex items-center gap-2">
                        <SearchField
                            aria-label="Search models"
                            autoFocus
                            className="flex-1"
                            name="search"
                            variant="secondary"
                        >
                            <SearchField.Group>
                                <SearchField.SearchIcon />
                                <SearchField.Input placeholder="Search models" />
                                <SearchField.ClearButton />
                            </SearchField.Group>
                        </SearchField>
                        <ToggleButton
                            isSelected={byProvider}
                            onChange={setByProvider}
                            size="sm"
                            variant="ghost"
                        >
                            <Icon className="size-4" icon={LayerIcon} />
                            By provider
                        </ToggleButton>
                    </div>
                    <ListBox renderEmptyState={() => <EmptyState>No models match.</EmptyState>}>
                        {sections.map((section) => (
                            <ListBox.Section id={section.id} key={section.id}>
                                {section.title ? (
                                    <Header className="flex items-center gap-2">
                                        <ModelAccountLogo
                                            account={section.options[0]?.provider ?? 'claude'}
                                        />
                                        {section.title}
                                    </Header>
                                ) : null}
                                {section.options.map((option) => (
                                    <ModelItem key={option.key} option={option} />
                                ))}
                            </ListBox.Section>
                        ))}
                    </ListBox>
                </Autocomplete.Filter>
            </Autocomplete.Popover>
        </Autocomplete>
    );
}

function ModelItem({ option }: { option: AgentModelOption }) {
    const detail = option.connected
        ? option.model.contextWindow
            ? `${contextWindowLabel(option.model.contextWindow)} context`
            : null
        : 'Connect in Settings → Models';
    return (
        <ListBox.Item id={option.key} textValue={option.label}>
            <div className="flex items-center gap-2">
                <ModelAccountLogo account={option.provider} />
                <div className="flex flex-col">
                    <Label>{option.label}</Label>
                    {detail ? <Description>{detail}</Description> : null}
                </div>
            </div>
            <ListBox.ItemIndicator />
        </ListBox.Item>
    );
}
