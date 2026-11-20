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
    if (!computer) {
        return null;
    }
    const reportsUsage = usage.data?.computers.some(
        (item) => item.computerId === computerId && item.usage
    );
    return (
        <>
            {computer.inventoryInvalidAt ? (
                <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                        <Alert.Title>Invalid inventory</Alert.Title>
                        <Alert.Description>
                            {computerLabel(computer)} reported an inventory this Server could not
                            read. Update Haus Computer on that Mac; this clears on its next valid
                            report.
                        </Alert.Description>
                        <CodeSnippet lines="haus-computer upgrade" />
                    </Alert.Content>
                </Alert>
            ) : null}
            {reportsUsage
                ? null
                : computer.reportedInventory?.runtimeIssues?.map((issue) => {
                      const command = runtimeLoginCommand(issue.runtimeId);
                      return (
                          <Alert key={issue.runtimeId} status="warning">
                              <Alert.Indicator />
                              <Alert.Content>
                                  <Alert.Title>{runtimeIssueLabel(issue.runtimeId)}</Alert.Title>
                                  <Alert.Description>
                                      Sign in on {computerLabel(computer)}.{' '}
                                      {issue.runtimeId === 'claude-code'
                                          ? 'Refresh Runtimes to recheck the login and clear this warning, then retry the Captain’s request.'
                                          : 'Then retry the Captain’s request. This notice clears after a successful turn using this runtime.'}
                                  </Alert.Description>
                                  {command ? <CodeSnippet lines={command} /> : null}
                              </Alert.Content>
                          </Alert>
                      );
                  })}
        </>
    );
}
