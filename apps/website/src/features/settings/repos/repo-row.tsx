import type { RepoListEntry } from '@haus/api';
import { ItemCard } from '@heroui-pro/react';
import { GithubIcon } from '@hugeicons-pro/core-solid-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { RepoRowAccessAction } from './repo-access-actions.tsx';
import { repoRowDescription } from './repo-access.ts';

export function RepoRow({
    repo,
    serverId,
    serverSlug,
}: {
    repo: RepoListEntry;
    serverId: string;
    serverSlug: string;
}) {
    return (
        <ItemCard>
            <ItemCard.Icon>
                <Icon aria-hidden="true" icon={GithubIcon} />
            </ItemCard.Icon>
            <ItemCard.Content>
                <ItemCard.Title>{repo.repository}</ItemCard.Title>
                <ItemCard.Description>{repoRowDescription(repo)}</ItemCard.Description>
            </ItemCard.Content>
            <ItemCard.Action>
                <RepoRowAccessAction
                    access={repo.githubAccess}
                    repository={repo.repository}
                    serverId={serverId}
                    serverSlug={serverSlug}
                />
            </ItemCard.Action>
        </ItemCard>
    );
}
