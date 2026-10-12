import { githubTriggerEventsMax } from '@haus/api';
import {
    Button,
    Description,
    Disclosure,
    Fieldset,
    type Key,
    Label,
    ListBox,
    Select,
    Tag,
    TagGroup,
} from '@heroui/react';
import { EventTextFields } from './trigger-github-event-text-fields.tsx';
import {
    createGithubEventDraft,
    type GithubEventDraft,
    githubEventOrder,
    githubEventSpecs,
    githubEventTextFields,
    githubValueLabel,
} from './trigger-github-events-model.ts';

/**
 * Which GitHub events wake the Agent: a multi-select of the closed event list,
 * then one fieldset per chosen event with its actions and filters. Filters
 * left empty match anything, so every one is optional.
 */
export function TriggerGithubEvents({
    events,
    isDisabled,
    onChange,
}: {
    events: readonly GithubEventDraft[];
    isDisabled: boolean;
    onChange: (events: GithubEventDraft[]) => void;
}) {
    const chosen = [...new Set(events.map((entry) => entry.event))];

    return (
        <>
            <Select
                disabledKeys={
                    events.length >= githubTriggerEventsMax
                        ? githubEventOrder.filter((name) => !chosen.includes(name))
                        : []
                }
                fullWidth
                isDisabled={isDisabled}
                isRequired
                onChange={(value) => {
                    const names = toKeys(value).flatMap((key) => {
                        const name = githubEventOrder.find((event) => event === String(key));
                        return name ? [name] : [];
                    });
                    onChange(
                        names.flatMap((name) => {
                            const existing = events.filter((entry) => entry.event === name);
                            return existing.length > 0 ? existing : [createGithubEventDraft(name)];
                        })
                    );
                }}
                placeholder="Choose events"
                selectionMode="multiple"
                value={chosen}
                variant="secondary"
            >
                <Label>Events</Label>
                <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox selectionMode="multiple">
                        {githubEventOrder.map((event) => (
                            <ListBox.Item
                                id={event}
                                key={event}
                                textValue={githubEventSpecs[event].label}
                            >
                                {githubEventSpecs[event].label}
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
            </Select>
            {events.map((entry) => (
                <EventFieldset
                    canAdd={events.length < githubTriggerEventsMax}
                    canRemove={events.filter((current) => current.event === entry.event).length > 1}
                    draft={entry}
                    isDisabled={isDisabled}
                    key={entry.key}
                    onAdd={() => onChange([...events, createGithubEventDraft(entry.event)])}
                    onChange={(next) =>
                        onChange(
                            events.map((current) => (current.key === next.key ? next : current))
                        )
                    }
                    onRemove={() => onChange(events.filter((current) => current.key !== entry.key))}
                />
            ))}
        </>
    );
}

function EventFieldset({
    draft,
    isDisabled,
    canAdd,
    canRemove,
    onAdd,
    onRemove,
    onChange,
}: {
    draft: GithubEventDraft;
    canAdd: boolean;
    canRemove: boolean;
    onAdd: () => void;
    onRemove: () => void;
    isDisabled: boolean;
    onChange: (draft: GithubEventDraft) => void;
}) {
    const spec = githubEventSpecs[draft.event];

    return (
        <Fieldset>
            <Fieldset.Legend>{spec.label}</Fieldset.Legend>
            <Description>
                All filters in this group must match. Any matching group wakes the Agent once. Names
                accept *, **, and ?. Exclusions win in this group.
            </Description>
            <Fieldset.Group>
                {spec.actions.length > 1 ? (
                    <ChoiceTags
                        disallowEmpty
                        isDisabled={isDisabled}
                        label="Actions"
                        onChange={(actions) => onChange({ ...draft, actions })}
                        options={spec.actions}
                        selected={draft.actions}
                    />
                ) : null}
                {spec.choices.map((choice) => (
                    <ChoiceTags
                        isDisabled={isDisabled}
                        key={choice.key}
                        label={choice.label}
                        onChange={(values) =>
                            onChange({
                                ...draft,
                                choices: { ...draft.choices, [choice.key]: values },
                            })
                        }
                        options={choice.options}
                        selected={draft.choices[choice.key] ?? []}
                    />
                ))}
                <EventTextFields
                    draft={draft}
                    fields={spec.texts}
                    isDisabled={isDisabled}
                    onChange={onChange}
                />
                <Disclosure
                    defaultExpanded={githubEventTextFields(draft.event).some(
                        (text) => !spec.texts.includes(text) && Boolean(draft.texts[text.key])
                    )}
                >
                    <Disclosure.Heading>
                        <Button size="sm" slot="trigger" variant="ghost">
                            More filters and exclusions
                            <Disclosure.Indicator />
                        </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                        <Disclosure.Body>
                            <div className="grid gap-4">
                                <EventTextFields
                                    draft={draft}
                                    fields={githubEventTextFields(draft.event).filter(
                                        (text) => !spec.texts.includes(text)
                                    )}
                                    isDisabled={isDisabled}
                                    onChange={onChange}
                                />
                            </div>
                        </Disclosure.Body>
                    </Disclosure.Content>
                </Disclosure>
                {spec.authors ? (
                    <ChoiceTags
                        disallowEmpty
                        isDisabled={isDisabled}
                        label="Authors"
                        mode="single"
                        onChange={([authors]) =>
                            onChange({
                                ...draft,
                                authors: authors === 'anyone' ? 'anyone' : 'collaborators',
                            })
                        }
                        options={['collaborators', 'anyone']}
                        selected={[draft.authors]}
                    />
                ) : null}
            </Fieldset.Group>
            <Fieldset.Actions>
                <Button
                    isDisabled={isDisabled || !canAdd}
                    onPress={onAdd}
                    size="sm"
                    variant="tertiary"
                >
                    Add alternative group
                </Button>
                {canRemove ? (
                    <Button isDisabled={isDisabled} onPress={onRemove} size="sm" variant="ghost">
                        Remove group
                    </Button>
                ) : null}
            </Fieldset.Actions>
        </Fieldset>
    );
}

/** A closed set of GitHub values as toggle tags; an empty filter matches anything. */
function ChoiceTags({
    disallowEmpty = false,
    isDisabled,
    label,
    mode = 'multiple',
    onChange,
    options,
    selected,
}: {
    disallowEmpty?: boolean;
    isDisabled: boolean;
    label: string;
    mode?: 'multiple' | 'single';
    onChange: (values: string[]) => void;
    options: readonly string[];
    selected: readonly string[];
}) {
    return (
        <TagGroup
            disabledKeys={isDisabled ? options : undefined}
            disallowEmptySelection={disallowEmpty}
            onSelectionChange={(keys) =>
                onChange(keys === 'all' ? [...options] : [...keys].map(String))
            }
            selectedKeys={selected}
            selectionMode={mode}
            size="sm"
        >
            <Label>{label}</Label>
            <TagGroup.List>
                {options.map((option) => (
                    <Tag id={option} key={option} textValue={githubValueLabel(option)}>
                        {githubValueLabel(option)}
                    </Tag>
                ))}
            </TagGroup.List>
        </TagGroup>
    );
}

function toKeys(value: Key | Key[] | null): Key[] {
    if (value === null) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
}
