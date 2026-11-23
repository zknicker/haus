import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Button, Separator } from '@heroui/react';
import { GithubIcon } from '@hugeicons-pro/core-solid-rounded';
import { RepositoryIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Fragment, useState } from 'react';
import { useRepos } from '../../../hooks/repos/use-repos.ts';
import {
    serverSettingsSectionRoute,
    settingsConnectionRoute,
} from '../../servers/server-routes.ts';
import { SettingsEmptyState } from '../layout/settings-empty.tsx';
import { SettingsPageColumn } from '../layout/settings-page-column.tsx';
import { SettingsPageHeader } from '../layout/settings-page-header.tsx';
import { AddRepoDialog } from './add-repo-dialog.tsx';
import { RepoRow } from './repo-row.tsx';
import { SettingsLinkRow } from './repos-link-row.tsx';

export function ReposSettings({ serverId, serverSlug }: { serverId: string; serverSlug: string }) {
    const repos = useRepos(serverId);
    const [adding, setAdding] = useState(false);
    const connectionId = repos.data?.githubConnectionId ?? null;

    return (
        <SettingsPageColumn>
            <SettingsPageHeader title="Repositories" />
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>
                        On this Server
                        {repos.data ? (
                            <span className="text-muted ms-2 tabular-nums">
                                {repos.data.repos.length}
                            </span>
                        ) : null}
                    </ItemCardGroup.Title>
                    <Button onPress={() => setAdding(true)} size="sm" variant="secondary">
                        Add repository
                    </Button>
                </ItemCardGroup.Header>
                {repos.data ? (
                    repos.data.repos.length === 0 ? (
                        <SettingsEmptyState
                            action={<Button onPress={() => setAdding(true)}>Add repository</Button>}
                            description="Add a checkout from one of your devices. Captains and Workers work in git worktrees of it."
                            icon={RepositoryIcon}
                            role="status"
                            title="No repositories yet"
                        />
                    ) : (
                        <ItemCardGroup>
                            {repos.data.repos.map((repo, index) => (
                                <Fragment key={repo.repository}>
                                    {index > 0 ? <Separator /> : null}
                                    <RepoRow
                                        repo={repo}
                                        serverId={serverId}
                                        serverSlug={serverSlug}
                                    />
                                </Fragment>
                            ))}
                        </ItemCardGroup>
                    )
                ) : repos.isError ? (
                    <ItemCardGroup>
                        <ItemCard>
                            <ItemCard.Content>
                                <ItemCard.Title>Repositories unavailable</ItemCard.Title>
                                <ItemCard.Description>{repos.error.message}</ItemCard.Description>
                            </ItemCard.Content>
                            <ItemCard.Action>
                                <Button
                                    onPress={() => void repos.refetch()}
                                    size="sm"
                                    variant="secondary"
                                >
                                    Try again
                                </Button>
                            </ItemCard.Action>
                        </ItemCard>
                    </ItemCardGroup>
                ) : null}
            </ItemCardGroup>
            {repos.data ? (
                <SettingsLinkRow
                    icon={GithubIcon}
                    to={
                        connectionId
                            ? settingsConnectionRoute(serverSlug, connectionId)
                            : serverSettingsSectionRoute(serverSlug, 'connections')
                    }
                >
                    Manage the GitHub installation
                </SettingsLinkRow>
            ) : null}
            {adding ? (
                <AddRepoDialog
                    onClose={() => setAdding(false)}
                    serverId={serverId}
                    serverSlug={serverSlug}
                />
            ) : null}
        </SettingsPageColumn>
    );
}
