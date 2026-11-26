import type { Agent } from '@haus/api';
import { Alert, buttonVariants } from '@heroui/react';
import { Link, useParams } from 'react-router-dom';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useModelConnections } from '../../hooks/servers/use-model-connections.ts';
import { computerLabel } from '../computers/presentation.ts';
import { agentRuntimeIssue, runtimeIssueLabel } from '../computers/runtime-issue-model.ts';
import { serverComputerRoute, serverSettingsSectionRoute } from '../servers/server-routes.ts';
import {
    type AgentConnectionIssue,
    agentConnectionIssue,
    connectionIssueFix,
    connectionIssueTitle,
} from './agent-model-connection-model.ts';
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
                </Alert.Description>
            </Alert.Content>
            {slug ? (
                <Link
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    to={serverComputerRoute(slug, computer.id)}
                >
                    View device
                </Link>
            ) : null}
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
    const fix = connectionIssueFix[issue.kind];
    // One scanline: the problem, then its fix as the alert's trailing action,
    // the way the wake-pause alert carries Restart.
    return (
        <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>{connectionIssueTitle(issue)}</Alert.Title>
                {issue.kind === 'failed' ? (
                    <Alert.Description>
                        {`${issue.connection.label}: ${issue.connection.statusDetail ?? 'the provider refused it.'}`}
                    </Alert.Description>
                ) : null}
                {slug ? null : <Alert.Description>{`${fix}.`}</Alert.Description>}
            </Alert.Content>
            {slug ? (
                <Link
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                    to={serverSettingsSectionRoute(slug, 'models')}
                >
                    {connectionIssueAction[issue.kind]}
                </Link>
            ) : null}
        </Alert>
    );
}

const connectionIssueAction: Record<AgentConnectionIssue['kind'], string> = {
    disabled: 'Turn on',
    failed: 'Reconnect',
    missing: 'Connect',
};
