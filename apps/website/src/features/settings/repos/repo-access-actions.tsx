import type { RepoGithubAccess } from '@haus/api';
import { Button, Popover } from '@heroui/react';
import { useNavigate } from 'react-router-dom';
import { useGithubStartInstall } from '../../../hooks/github/use-github-start-install.ts';
import { useRepos } from '../../../hooks/repos/use-repos.ts';
import {
    serverSettingsSectionRoute,
    settingsConnectionRoute,
} from '../../servers/server-routes.ts';
import { accessSentence, type RepoAccessFix, repoAccessFix } from './repo-access.ts';

export function RepoAccessActions({
    access,
    serverId,
    serverSlug,
}: {
    access: RepoGithubAccess;
    serverId: string;
    serverSlug: string;
}) {
    const repos = useRepos(serverId);
    if (!repos.data || access.status === 'ready') {
        return null;
    }
    const fix = repoAccessFix(access, repos.data);
    return (
        <div className="flex items-center gap-2">
            {fix ? (
                <RepoAccessFixButton fix={fix} serverId={serverId} serverSlug={serverSlug} />
            ) : null}
            {access.status === 'github-not-connected' ? null : (
                <Button
                    isPending={repos.isFetching}
                    onPress={() => void repos.refetch()}
                    size="sm"
                    variant="ghost"
                >
                    Recheck
                </Button>
            )}
        </div>
    );
}

export function RepoRowAccessAction({
    access,
    repository,
    serverId,
    serverSlug,
}: {
    access: RepoGithubAccess;
    repository: string;
    serverId: string;
    serverSlug: string;
}) {
    const repos = useRepos(serverId);
    if (!repos.data || access.status === 'ready') {
        return null;
    }
    const fix = repoAccessFix(access, repos.data);
    const recheck = (
        <Button
            isPending={repos.isFetching}
            onPress={() => void repos.refetch()}
            size="sm"
            variant="secondary"
        >
            Recheck
        </Button>
    );
    if (!fix) {
        return recheck;
    }
    const fixButton = <RepoAccessFixButton fix={fix} serverId={serverId} serverSlug={serverSlug} />;
    if (access.status === 'github-not-connected') {
        return fixButton;
    }
    return (
        <Popover>
            <Button aria-label={`Fix access to ${repository}`} size="sm" variant="secondary">
                Fix
            </Button>
            <Popover.Content offset={8} placement="bottom end">
                <Popover.Dialog aria-label={`${repository} access`}>
                    <div className="flex w-72 flex-col gap-3 p-3 text-sm">
                        <p>{accessSentence(access.status, repository)}</p>
                        <div className="flex items-center gap-2">
                            {fixButton}
                            {recheck}
                        </div>
                    </div>
                </Popover.Dialog>
            </Popover.Content>
        </Popover>
    );
}

function RepoAccessFixButton({
    fix,
    serverId,
    serverSlug,
}: {
    fix: RepoAccessFix;
    serverId: string;
    serverSlug: string;
}) {
    const navigate = useNavigate();
    if (fix.kind === 'install') {
        return <InstallButton connectionId={fix.connectionId} serverId={serverId} />;
    }
    if (fix.kind === 'settings') {
        return (
            <Button
                onPress={() => window.open(fix.url, '_blank', 'noopener,noreferrer')}
                size="sm"
                variant="secondary"
            >
                Grant on GitHub
            </Button>
        );
    }
    const route =
        fix.kind === 'connection'
            ? settingsConnectionRoute(serverSlug, fix.connectionId)
            : serverSettingsSectionRoute(serverSlug, 'connections');
    return (
        <Button onPress={() => navigate(route)} size="sm" variant="secondary">
            {fix.kind === 'connection' ? 'Grant on GitHub' : 'Connect GitHub'}
        </Button>
    );
}

function InstallButton({ connectionId, serverId }: { connectionId: string; serverId: string }) {
    const install = useGithubStartInstall(serverId, connectionId);
    return (
        <Button
            isPending={install.isPending}
            onPress={() => void install.start()}
            size="sm"
            variant="secondary"
        >
            Grant on GitHub
        </Button>
    );
}
