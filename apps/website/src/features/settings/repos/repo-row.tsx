import type { RepoListEntry } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { GithubIcon } from '@hugeicons-pro/core-solid-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { SettingsStatusChip, SettingsStatusTitle } from '../layout/settings-row-title.tsx';
import { RepoAccessActions } from './repo-access-actions.tsx';
import { repoAccessChips, repoFolderSummary } from './repo-access.ts';

export function RepoRow({
    repo,
    serverId,
    serverSlug,
}: {
    repo: RepoListEntry;
    serverId: string;
    serverSlug: string;
}) {
    const chip = repoAccessChips[repo.githubAccess.status];
    return (
        <ItemCard>
            <ItemCard.Icon>
                <Icon aria-hidden="true" icon={GithubIcon} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <SettingsStatusTitle
                    status={
                        <SettingsStatusChip color={chip.color}>{chip.label}</SettingsStatusChip>
                    }
                >
                    {repo.repository}
                </SettingsStatusTitle>
                <ItemCard.Description>{repoFolderSummary(repo)}</ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <RepoAccessActions
                    access={repo.githubAccess}
                    serverId={serverId}
                    serverSlug={serverSlug}
                />
            </ItemCard.Action>
        </ItemCard>
    );
}
