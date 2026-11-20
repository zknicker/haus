import type { Agent } from '@haus/api';
import { Alert } from '@heroui/react';
import { Link, useParams } from 'react-router-dom';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useModelConnections } from '../../hooks/servers/use-model-connections.ts';
import { computerLabel } from '../computers/presentation.ts';
import { agentRuntimeIssue, runtimeIssueLabel } from '../computers/runtime-issue-model.ts';
import { serverComputerRoute, serverSettingsSectionRoute } from '../servers/server-routes.ts';
import { type AgentConnectionIssue, agentConnectionIssue } from './agent-model-connection-model.ts';
import { AgentWakePauseAlert } from './agent-wake-pause-alert.tsx';

/**
 * What stands between the Agent and its next turn. A runtime sign-in issue
 * outranks a wake pause: it names the concrete fix, and repeated sign-in
 * failures are usually why the Agent paused. A refused or missing model
 * connection, which only an Agent on the runner has, shows beside the wake
 * pause so Restart stays in reach.
 */
export function AgentRuntimeIssue({ agent, canRestart }: { agent: Agent; canRestart: boolean }) {
    const computers = useComputers(agent.serverId);
    const connections = useModelConnections(agent.serverId);
    const { slug } = useParams();
    const computer = computers.data?.find(({ id }) => id === agent.computerId);
    const issue = agentRuntimeIssue(agent, computer?.reportedInventory ?? null);
    if (!(computer && issue)) {
        const connectionIssue = connections.data
            ? agentConnectionIssue(agent, connections.data)
            : null;
        return (
            <>
                {connectionIssue ? (
                    <AgentConnectionAlert issue={connectionIssue} slug={slug} />
                ) : null}
                {agent.wakePause ? (
                    <AgentWakePauseAlert
                        agent={agent}
                        canRestart={canRestart}
                        wakePause={agent.wakePause}
                    />
                ) : null}
            </>
        );
    }
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{runtimeIssueLabel(issue.runtimeId)}</Alert.Title>
                <Alert.Description>
                    Sign in on {computerLabel(computer)} to let {agent.displayName} continue.
                    {slug ? (
                        <>
                            {' '}
                            <Link
                                className="text-accent underline"
                                to={serverComputerRoute(slug, computer.id)}
                            >
                                View device
                            </Link>
                        </>
                    ) : null}
                </Alert.Description>
            </Alert.Content>
        </Alert>
    );
}

function AgentConnectionAlert({
    issue,
    slug,
}: {
    issue: AgentConnectionIssue;
    slug: string | undefined;
}) {
    const fix =
        issue.kind === 'failed'
            ? 'Reconnect in Settings → Models'
            : 'Connect one in Settings → Models';
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>
                    {issue.kind === 'failed'
                        ? `${issue.providerName} connection failed`
                        : `No ${issue.providerName} connection`}
                </Alert.Title>
                <Alert.Description>
                    {issue.kind === 'failed'
                        ? `${issue.connection.label}: ${issue.connection.statusDetail ?? 'the provider refused it.'} `
                        : null}
                    {slug ? (
                        <Link
                            className="text-accent underline"
                            to={serverSettingsSectionRoute(slug, 'models')}
                        >
                            {fix}
                        </Link>
                    ) : (
                        `${fix}.`
                    )}
                </Alert.Description>
            </Alert.Content>
        </Alert>
    );
}
