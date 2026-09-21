import { Alert } from '@heroui/react';
import { CodeSnippet } from '../../components/code-snippet.tsx';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useUsage } from '../../hooks/servers/use-usage.ts';
import { computerLabel } from './presentation.ts';
import { runtimeIssueLabel, runtimeLoginCommand } from './runtime-issue-model.ts';

export function ComputerRuntimeIssues({
    computerId,
    serverId,
}: {
    computerId: string;
    serverId: string;
}) {
    const computers = useComputers(serverId);
    const usage = useUsage(serverId);
    const computer = computers.data?.find(({ id }) => id === computerId);
    if (
        !computer ||
        usage.data?.computers.some((item) => item.computerId === computerId && item.usage)
    ) {
        return null;
    }
    return (
        <>
            {computer.reportedInventory?.runtimeIssues?.map((issue) => {
                const command = runtimeLoginCommand(issue.runtimeId);
                return (
                    <Alert key={issue.runtimeId} status="warning">
                        <Alert.Indicator />
                        <Alert.Content>
                            <Alert.Title>{runtimeIssueLabel(issue.runtimeId)}</Alert.Title>
                            <Alert.Description>
                                Sign in on {computerLabel(computer)}, then retry the Agent's
                                request. This notice clears after a successful turn using this
                                runtime.
                            </Alert.Description>
                            {command ? <CodeSnippet lines={command} /> : null}
                        </Alert.Content>
                    </Alert>
                );
            })}
        </>
    );
}
