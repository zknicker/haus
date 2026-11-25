import type { PullRequestReading } from '@haus/api';
import { ListView } from '@heroui-pro/react';
import { toast } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';
import { Icon } from '../../../components/ui/icon.tsx';
import { openExternalLink } from '../../../lib/open-external-link.ts';
import { pullRequestCheckLabels, pullRequestStateChip } from './task-work-model.ts';

const stateTones = {
    accent: 'text-accent',
    default: 'text-muted',
    success: 'text-success',
} as const;

export function PullRequestRows({ readings }: { readings: readonly PullRequestReading[] }) {
    return (
        <ListView
            aria-label="Pull requests"
            items={readings.map((reading) => ({ ...reading, id: reading.url }))}
            onAction={(key) => openPullRequest(String(key))}
            variant="secondary"
        >
            {(reading) => (
                <ListView.Item
                    id={reading.url}
                    textValue={`${reading.repository}#${reading.number}`}
                >
                    <ListView.ItemContent data-testid="pull-request-row">
                        <Icon
                            aria-label={pullRequestStateChip[reading.state].label}
                            className={`${stateTones[pullRequestStateChip[reading.state].color]} mt-0.5 self-start`}
                            icon={GitPullRequestIcon}
                            size={16}
                        />
                        <div className="flex min-w-0 flex-1 flex-col">
                            <ListView.Title>
                                {reading.title ?? `${repositoryName(reading)}#${reading.number}`}
                            </ListView.Title>
                            <ListView.Description className="pull-request-meta">
                                <span className="pull-request-meta__facts">
                                    {`${repositoryName(reading)}#${reading.number} · ${pullRequestStateChip[reading.state].label} · ${pullRequestCheckLabels[reading.checks]}`}
                                </span>
                                <span className="pull-request-meta__diff">
                                    <span className="text-success">+{reading.additions}</span>
                                    <span className="text-danger"> −{reading.deletions}</span>
                                </span>
                            </ListView.Description>
                        </div>
                    </ListView.ItemContent>
                </ListView.Item>
            )}
        </ListView>
    );
}

function repositoryName(reading: Pick<PullRequestReading, 'repository'>) {
    return reading.repository.split('/').at(-1) ?? reading.repository;
}

function openPullRequest(url: string) {
    openExternalLink(url).catch(() => toast.danger('Could not open the pull request'));
}
