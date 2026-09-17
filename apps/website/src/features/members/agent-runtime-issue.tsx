import type { Agent } from '@haus/api';
import { Alert } from '@heroui/react';
import { Link, useParams } from 'react-router-dom';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { computerLabel } from '../computers/presentation.ts';
import { agentRuntimeIssue, runtimeIssueLabel } from '../computers/runtime-issue-model.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';

export function AgentRuntimeIssue({ agent }: { agent: Agent }) {
    const computers = useComputers(agent.serverId);
    const { slug } = useParams();
    const computer = computers.data?.find(({ id }) => id === agent.computerId);
    const issue = agentRuntimeIssue(agent, computer?.reportedInventory ?? null);
    if (!(computer && issue)) {
        return null;
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
                                to={`${serverComputersRoute(slug)}?computer=${encodeURIComponent(computer.id)}`}
                            >
                                View Computer
                            </Link>
                        </>
                    ) : null}
                </Alert.Description>
            </Alert.Content>
        </Alert>
    );
}
