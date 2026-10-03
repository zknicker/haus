import {
    Autocomplete,
    Description,
    EmptyState,
    Header,
    Label,
    ListBox,
    SearchField,
} from '@heroui/react';
import * as React from 'react';
import type { CloudAgentModelOption, CloudAgentModelView } from './cloud-agent-model.ts';

/**
 * The Model control: a select whose popover holds the search, so 40-odd
 * models stay one keystroke away while the closed control still reads as a
 * plain value. Sections follow the product's family order.
 */
export function CloudAgentModelPicker({
    onPick,
    view,
}: {
    onPick: (key: unknown) => void;
    view: CloudAgentModelView;
}) {
    // React Aria filters on each item's textValue (the label); the lookup lets
    // a search also match the Cursor id behind it.
    const searchTextByLabel = React.useMemo(
        () => new Map(view.options.map((option) => [option.label, option.searchText])),
        [view.options]
    );
    const filter = React.useCallback(
        (textValue: string, input: string) =>
            (searchTextByLabel.get(textValue) ?? textValue.toLowerCase()).includes(
                input.trim().toLowerCase()
            ),
        [searchTextByLabel]
    );

    return (
        <Autocomplete
            aria-label="Cloud Agent model"
            className="w-60"
            disabledKeys={view.options
                .filter((option) => option.unavailable)
                .map((option) => option.id)}
            isDisabled={!view.pickable}
            onChange={(key) => {
                if (key !== view.selectedKey) {
                    onPick(key);
                }
            }}
            value={view.selectedKey}
            variant="secondary"
        >
            <Autocomplete.Trigger>
                <Autocomplete.Value />
                <Autocomplete.Indicator />
            </Autocomplete.Trigger>
            <Autocomplete.Popover>
                <Autocomplete.Filter filter={filter}>
                    <SearchField
                        aria-label="Search Cloud Agent models"
                        autoFocus
                        name="search"
                        variant="secondary"
                    >
                        <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Search models" />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <ListBox renderEmptyState={() => <EmptyState>No models match.</EmptyState>}>
                        {view.sections.map((section) => (
                            <ListBox.Section id={section.id} key={section.id}>
                                {section.title ? <Header>{section.title}</Header> : null}
                                {section.options.map((option) => (
                                    <ModelItem key={option.id} option={option} />
                                ))}
                            </ListBox.Section>
                        ))}
                    </ListBox>
                </Autocomplete.Filter>
            </Autocomplete.Popover>
        </Autocomplete>
    );
}

function ModelItem({ option }: { option: CloudAgentModelOption }) {
    const detail = option.unavailable ? 'Unavailable' : option.description;
    return (
        <ListBox.Item id={option.id} textValue={option.label}>
            {detail ? (
                <div className="flex flex-col">
                    <Label>{option.label}</Label>
                    <Description>{detail}</Description>
                </div>
            ) : (
                <Label>{option.label}</Label>
            )}
            <ListBox.ItemIndicator />
        </ListBox.Item>
    );
}
