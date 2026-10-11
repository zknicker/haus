import {
    Fieldset,
    Input,
    type Key,
    Label,
    ListBox,
    Select,
    Tag,
    TagGroup,
    TextField,
} from '@heroui/react';
import {
    createGithubEventDraft,
    type GithubEventDraft,
    githubEventOrder,
    githubEventSpecs,
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
    const chosen = events.map((entry) => entry.event);

    return (
        <>
            <Select
                fullWidth
                isDisabled={isDisabled}
                isRequired
                onChange={(value) => {
                    const names = toKeys(value).flatMap((key) => {
                        const name = githubEventOrder.find((event) => event === String(key));
                        return name ? [name] : [];
                    });
                    onChange(
                        names.map(
                            (name) =>
                                events.find((entry) => entry.event === name) ??
                                createGithubEventDraft(name)
                        )
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
                    draft={entry}
                    isDisabled={isDisabled}
                    key={entry.event}
                    onChange={(next) =>
                        onChange(
                            events.map((current) => (current.event === next.event ? next : current))
                        )
                    }
                />
            ))}
        </>
    );
}

function EventFieldset({
    draft,
    isDisabled,
    onChange,
}: {
    draft: GithubEventDraft;
    isDisabled: boolean;
    onChange: (draft: GithubEventDraft) => void;
}) {
    const spec = githubEventSpecs[draft.event];

    return (
        <Fieldset>
            <Fieldset.Legend>{spec.label}</Fieldset.Legend>
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
                {spec.texts.map((text) => (
                    <TextField
                        fullWidth
                        isDisabled={isDisabled}
                        key={text.key}
                        onChange={(value) =>
                            onChange({ ...draft, texts: { ...draft.texts, [text.key]: value } })
                        }
                        value={draft.texts[text.key] ?? ''}
                        variant="secondary"
                    >
                        <Label>{text.label}</Label>
                        <Input placeholder={text.placeholder} />
                    </TextField>
                ))}
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
