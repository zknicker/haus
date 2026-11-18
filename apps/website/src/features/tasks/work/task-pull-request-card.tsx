import type { CloudAgentPullRequestReading } from '@haus/api';
import { Button, Chip, toast } from '@heroui/react';
import { GitPullRequestIcon } from '@hugeicons-pro/core-stroke-rounded';

import { ActionCard } from '../../../components/chats/action-card.tsx';
import { Icon } from '../../../components/ui/icon.tsx';
import { openExternalLink } from '../../../lib/open-external-link.ts';
import { pullRequestFacts, pullRequestStateChip } from './task-work-model.ts';

export function TaskPullRequestCard({ reading }: { reading: CloudAgentPullRequestReading }) {
    const chip = pullRequestStateChip[reading.state];
    return (
        <ActionCard
            actionKind="pull-request"
            actionStatus={reading.state}
            aria-label={`Pull request #${reading.number}`}
        >
            <ActionCard.Header>
                <ActionCard.Mark>
                    <Icon aria-hidden="true" icon={GitPullRequestIcon} size={20} />
                </ActionCard.Mark>
                <ActionCard.Content>
                    <ActionCard.Title>
                        {reading.title ?? `PR #${reading.number}`}
                        <ActionCard.Status>
                            <Chip color={chip.color} size="sm" variant="soft">
                                <Chip.Label>{chip.label}</Chip.Label>
                            </Chip>
                        </ActionCard.Status>
                    </ActionCard.Title>
                    <ActionCard.Description>
                        {`${reading.repository} · #${reading.number}`}
                    </ActionCard.Description>
                </ActionCard.Content>
            </ActionCard.Header>
            <ActionCard.Meta>
                {pullRequestFacts(reading)}
                <span className="text-success"> +{reading.additions}</span>
                <span className="text-danger"> −{reading.deletions}</span>
            </ActionCard.Meta>
            <ActionCard.Actions>
                <Button onPress={() => openPullRequest(reading.url)} size="sm" variant="primary">
                    <Icon aria-hidden="true" icon={GitPullRequestIcon} size={16} />
                    View PR
                </Button>
            </ActionCard.Actions>
        </ActionCard>
    );
}

function openPullRequest(url: string) {
    openExternalLink(url).catch(() => toast.danger('Could not open the pull request'));
}
