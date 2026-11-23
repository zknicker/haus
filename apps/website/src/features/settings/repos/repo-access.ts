import type { RepoGithubAccess, RepoGithubAccessStatus, RepoList } from '@haus/api';
import type { ChipProps } from '@heroui/react';
import { githubInstallationSettingsUrl } from '../connections/built-in/github/github-installation-model.ts';

export const repoAccessChips = {
    'app-needs-access': { color: 'warning', label: 'App access needed' },
    'github-not-connected': { color: 'default', label: 'GitHub not connected' },
    'github-unavailable': { color: 'default', label: 'GitHub unavailable' },
    ready: { color: 'success', label: 'Ready' },
} as const satisfies Record<RepoGithubAccessStatus, { color: ChipProps['color']; label: string }>;

export type RepoAccessFix =
    | { kind: 'connect' }
    | { connectionId: string; kind: 'connection' | 'install' }
    | { kind: 'settings'; url: string };

export function repoAccessFix(
    access: RepoGithubAccess,
    github: Pick<RepoList, 'canInstallGithubApp' | 'githubConnectionId'>
) {
    if (access.status === 'github-not-connected') {
        return { kind: 'connect' } satisfies RepoAccessFix;
    }
    if (access.status !== 'app-needs-access') {
        return null;
    }
    if (access.installation) {
        return {
            kind: 'settings',
            url: githubInstallationSettingsUrl(access.installation),
        } satisfies RepoAccessFix;
    }
    if (!github.githubConnectionId) {
        return { kind: 'connect' } satisfies RepoAccessFix;
    }
    return {
        connectionId: github.githubConnectionId,
        kind: github.canInstallGithubApp ? 'install' : 'connection',
    } satisfies RepoAccessFix;
}

export function repoFolderSummary(repo: Pick<RepoList['repos'][number], 'folders'>) {
    if (repo.folders.length === 0) {
        return 'No folders yet';
    }
    return repo.folders
        .map((folder) => {
            const name = folder.computerName ?? 'Unnamed device';
            return folder.state && folder.state !== 'present'
                ? `${name} (${folderStateLabels[folder.state]})`
                : name;
        })
        .join(', ');
}

export const folderStateLabels = {
    missing: 'missing',
    'other-origin': 'different origin',
} as const;
