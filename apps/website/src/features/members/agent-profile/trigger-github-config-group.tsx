import type { GithubTrigger } from '@haus/api';
import { Alert, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { AutomationFactRow } from './automation-fact-row.tsx';
import { githubEventSpecs, githubEventSummary } from './trigger-github-events-model.ts';
import {
    githubProblemFix,
    githubProblemTitle,
    githubScopeSummary,
} from './trigger-github-model.ts';

/**
 * What a GitHub Trigger listens to, read-only: a problem first with its fix,
 * because an armed Trigger with a problem does not fire, then the
 * installation, repositories, and one row per event. Skipped fires appear only
 * once there are some, so a quiet Trigger carries no zero.
 */
export function TriggerGithubConfigGroup({
    agentName,
    trigger,
}: {
    agentName: string;
    trigger: GithubTrigger;
}) {
    const { github } = trigger;

    return (
        <>
            {github.problem ? (
                <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>{githubProblemTitle(github.problem)}</Alert.Title>
                        <Alert.Description>
                            {githubProblemFix(github.problem, {
                                agentName,
                                login: github.installationLogin,
                            })}
                        </Alert.Description>
                    </Alert.Content>
                </Alert>
            ) : null}
            <ItemCardGroup variant="transparent">
                <ItemCardGroup.Header>
                    <ItemCardGroup.Title>When to run</ItemCardGroup.Title>
                </ItemCardGroup.Header>
                <ItemCardGroup className="overflow-hidden">
                    <AutomationFactRow title="Installation">
                        {github.installationLogin}
                    </AutomationFactRow>
                    <Separator />
                    <AutomationFactRow title="Repositories">
                        {githubScopeSummary(github)}
                    </AutomationFactRow>
                    {github.events.map((entry, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: Read-only match groups have ordinal identity, including identical alternatives.
                        <Fragment key={`${entry.event}-${index}`}>
                            <Separator />
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>
                                        {githubEventSpecs[entry.event].label}
                                    </ItemCard.Title>
                                    <ItemCard.Description className="max-w-full whitespace-pre-wrap break-words">
                                        {githubEventSummary(entry)}
                                    </ItemCard.Description>
                                </ItemCard.Content>
                            </ItemCard>
                        </Fragment>
                    ))}
                    {github.suppressedCount > 0 ? (
                        <>
                            <Separator />
                            <AutomationFactRow title="Skipped over rate limit">
                                {github.suppressedCount}
                            </AutomationFactRow>
                        </>
                    ) : null}
                </ItemCardGroup>
            </ItemCardGroup>
        </>
    );
}
