import { Alert, Button, toast } from '@heroui/react';
import { useDesktopActivity } from '../../hooks/computer-use/use-desktop-activity.ts';
import { useStopDesktopInput } from '../../hooks/computer-use/use-stop-desktop-input.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';

export function ComputerUseStop({
    computerId,
    deviceName,
    serverId,
}: {
    computerId: string;
    deviceName: string;
    serverId: string;
}) {
    const activity = useDesktopActivity(serverId, computerId);
    const agents = useAgents(serverId);
    const stop = useStopDesktopInput();
    const agentIds = [...new Set(activity.data?.commands.map((command) => command.agentId))];
    if (agentIds.length === 0) {
        return null;
    }
    const names = agentIds.map(
        (id) => agents.data?.find((agent) => agent.id === id)?.displayName ?? 'A Captain'
    );
    return (
        <Alert status="accent">
            <Alert.Indicator />
            <Alert.Content>
                <Alert.Title>
                    {new Intl.ListFormat('en', { type: 'conjunction' }).format(names)}{' '}
                    {names.length === 1 ? 'is' : 'are'} using {deviceName}
                </Alert.Title>
            </Alert.Content>
            <Button
                isPending={stop.isPending}
                onPress={() =>
                    stop.mutate(
                        { computerId, serverId },
                        {
                            onError: (error) =>
                                toast.danger('Couldn’t stop Captain input', {
                                    description: error.message,
                                }),
                        }
                    )
                }
                size="sm"
                variant="danger"
            >
                Stop Captain input
            </Button>
        </Alert>
    );
}
