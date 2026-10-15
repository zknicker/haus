import type { LinearTrigger } from '@haus/api';
import { Alert, Separator } from '@heroui/react';
import { ItemCard, ItemCardGroup } from '@heroui-pro/react';
import { Fragment } from 'react';
import { useAgents } from '../../../hooks/members/use-agents.ts';
import { AutomationFactRow } from './automation-fact-row.tsx';
import {
    linearGroupSummary,
    linearGroupTitle,
    linearProblemFix,
    linearProblemTitle,
} from './trigger-linear-model.ts';

/**
 * What a Linear Trigger listens to, read-only: a problem first with its fix,
 * then the workspace and one row per match group by display name. Skipped
 * counts appear only once there are some.
 */
export function TriggerLinearConfigGroup({
    agentName,
    serverId,
    trigger,
}: {
    agentName: string;
    serverId: string;
    trigger: LinearTrigger;
}) {
    const { linear } = trigger;
    const agents = useAgents(serverId).data;
    const nameOf = (agentId: string) =>
        agents?.find((agent) => agent.id === agentId)?.displayName ?? 'An Agent';

    return (
        <>
            {linear.problem ? (
                <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>{linearProblemTitle(linear.problem)}</Alert.Title>
                        <Alert.Description>
                            {linearProblemFix(linear.problem, {
                                agentName,
                                workspaceName: linear.workspaceName,
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
                    <AutomationFactRow title="Workspace">{linear.workspaceName}</AutomationFactRow>
                    {linear.groups.map((group, index) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: Read-only match groups have ordinal identity, including identical alternatives.
                        <Fragment key={`${group.event}-${index}`}>
                            <Separator />
                            <ItemCard>
                                <ItemCard.Content>
                                    <ItemCard.Title>{linearGroupTitle(group)}</ItemCard.Title>
                                    <ItemCard.Description className="max-w-full whitespace-pre-wrap break-words">
                                        {linearGroupSummary(group, linear.display, nameOf)}
                                    </ItemCard.Description>
                                </ItemCard.Content>
                            </ItemCard>
                        </Fragment>
                    ))}
                    {linear.selfSuppressedCount > 0 ? (
                        <>
                            <Separator />
                            <AutomationFactRow title={`Skipped as ${agentName}'s own changes`}>
                                {linear.selfSuppressedCount}
                            </AutomationFactRow>
                        </>
                    ) : null}
                    {linear.suppressedCount > 0 ? (
                        <>
                            <Separator />
                            <AutomationFactRow title="Skipped over rate limit">
                                {linear.suppressedCount}
                            </AutomationFactRow>
                        </>
                    ) : null}
                </ItemCardGroup>
            </ItemCardGroup>
        </>
    );
}
