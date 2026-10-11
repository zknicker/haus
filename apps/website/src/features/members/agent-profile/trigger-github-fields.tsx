import {
    Autocomplete,
    Description,
    EmptyState,
    FieldError,
    type Key,
    Label,
    ListBox,
    SearchField,
    Select,
    Tag,
    TagGroup,
    useFilter,
} from '@heroui/react';
import { useGithubRepositories } from '../../../hooks/github/use-github-repositories.ts';
import { SettingsRowError } from '../../settings/layout/settings-text.tsx';
import { githubRepositoryScopeLabel } from '../../settings/mcp/github-installation-model.ts';
import { refusalText } from './agent-trigger-model.ts';
import { TriggerGithubEvents } from './trigger-github-events.tsx';
import {
    type GithubInstallationOption,
    type GithubTriggerDraft,
    githubInstallationRemedy,
} from './trigger-github-model.ts';

/**
 * The GitHub half of the create form, in the order it narrows: which
 * installation, which of its repositories, then which events.
 */
export function TriggerGithubFields({
    agentName,
    draft,
    isDisabled,
    loadError,
    onChange,
    options,
    serverId,
}: {
    agentName: string;
    draft: GithubTriggerDraft;
    isDisabled: boolean;
    /** Why some or all installations could not be listed. */
    loadError: string | null;
    onChange: (draft: GithubTriggerDraft) => void;
    options: readonly GithubInstallationOption[];
    serverId: string;
}) {
    return (
        <>
            <Select
                // Listed rather than hidden, so each one says what unlocks it.
                disabledKeys={options
                    .filter((option) => option.blocker !== null)
                    .map((option) => option.installation.id)}
                fullWidth
                isDisabled={isDisabled}
                isInvalid={loadError !== null}
                isRequired
                onChange={(selected) => {
                    const option = options.find(
                        (candidate) =>
                            candidate.installation.id === String(selected) &&
                            candidate.blocker === null
                    );
                    if (option && option.installation.id !== draft.installationId) {
                        onChange({
                            ...draft,
                            installationId: option.installation.id,
                            repositories: [],
                        });
                    }
                }}
                placeholder="Choose an installation"
                value={draft.installationId}
                variant="secondary"
            >
                <Label>Installation</Label>
                <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        {options.map(({ blocker, installation }) => (
                            <ListBox.Item
                                id={installation.id}
                                key={installation.id}
                                textValue={installation.account.login}
                            >
                                <Label>{installation.account.login}</Label>
                                <Description>
                                    {blocker
                                        ? githubInstallationRemedy(blocker, agentName)
                                        : githubRepositoryScopeLabel(installation)}
                                </Description>
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Select.Popover>
                {loadError ? <FieldError>{loadError}</FieldError> : null}
            </Select>
            <Select
                fullWidth
                isDisabled={isDisabled || !draft.installationId}
                onChange={(selected) =>
                    onChange({
                        ...draft,
                        scope:
                            String(selected) === 'repositories' ? 'repositories' : 'installation',
                    })
                }
                value={draft.scope}
                variant="secondary"
            >
                <Label>Repositories</Label>
                <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                    <ListBox>
                        <ListBox.Item id="installation" textValue="All accessible repositories">
                            All accessible repositories
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="repositories" textValue="Selected repositories">
                            Selected repositories
                            <ListBox.ItemIndicator />
                        </ListBox.Item>
                    </ListBox>
                </Select.Popover>
            </Select>
            {draft.scope === 'repositories' && draft.installationId ? (
                <RepositoryPicker
                    installationId={draft.installationId}
                    isDisabled={isDisabled}
                    onChange={(repositories) => onChange({ ...draft, repositories })}
                    selected={draft.repositories}
                    serverId={serverId}
                />
            ) : null}
            <TriggerGithubEvents
                events={draft.events}
                isDisabled={isDisabled}
                onChange={(events) => onChange({ ...draft, events })}
            />
        </>
    );
}

/** Searchable over what the connection's GitHub user can reach in the installation. */
function RepositoryPicker({
    installationId,
    isDisabled,
    onChange,
    selected,
    serverId,
}: {
    installationId: string;
    isDisabled: boolean;
    onChange: (names: string[]) => void;
    selected: readonly string[];
    serverId: string;
}) {
    const repositories = useGithubRepositories(serverId, installationId);
    const { contains } = useFilter({ sensitivity: 'base' });

    if (repositories.error) {
        return <SettingsRowError>{refusalText(repositories.error.message)}</SettingsRowError>;
    }

    return (
        <Autocomplete
            fullWidth
            isDisabled={isDisabled || !repositories.data}
            isRequired
            onChange={(keys: Key | Key[] | null) =>
                onChange((Array.isArray(keys) ? keys : keys === null ? [] : [keys]).map(String))
            }
            placeholder="Choose repositories"
            selectionMode="multiple"
            value={[...selected]}
            variant="secondary"
        >
            <Label>Selected repositories</Label>
            <Autocomplete.Trigger>
                <Autocomplete.Value>
                    {({ defaultChildren, isPlaceholder }) =>
                        isPlaceholder || selected.length === 0 ? (
                            defaultChildren
                        ) : (
                            <TagGroup
                                aria-label="Selected repositories"
                                onRemove={(keys) =>
                                    onChange(selected.filter((name) => !keys.has(name)))
                                }
                                size="sm"
                            >
                                <TagGroup.List>
                                    {selected.map((name) => (
                                        <Tag id={name} key={name} textValue={name}>
                                            {name}
                                        </Tag>
                                    ))}
                                </TagGroup.List>
                            </TagGroup>
                        )
                    }
                </Autocomplete.Value>
                <Autocomplete.Indicator />
            </Autocomplete.Trigger>
            <Autocomplete.Popover>
                <Autocomplete.Filter filter={contains}>
                    <SearchField aria-label="Search repositories" autoFocus variant="secondary">
                        <SearchField.Group>
                            <SearchField.SearchIcon />
                            <SearchField.Input placeholder="Search repositories" />
                            <SearchField.ClearButton />
                        </SearchField.Group>
                    </SearchField>
                    <ListBox
                        renderEmptyState={() => <EmptyState>No repositories match.</EmptyState>}
                    >
                        {(repositories.data ?? []).map((repository) => (
                            <ListBox.Item
                                id={repository.fullName}
                                key={repository.id}
                                textValue={repository.fullName}
                            >
                                {repository.fullName}
                                <ListBox.ItemIndicator />
                            </ListBox.Item>
                        ))}
                    </ListBox>
                </Autocomplete.Filter>
            </Autocomplete.Popover>
        </Autocomplete>
    );
}
