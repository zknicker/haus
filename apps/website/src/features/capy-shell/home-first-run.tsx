import { EmptyState } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { DashboardSquare01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../../components/ui/icon.tsx';
import { CreateAgentDialog } from '../members/create-agent-dialog.tsx';
import { serverComputersRoute } from '../servers/server-routes.ts';
import { NewProjectDialog } from '../shell/new-project-dialog.tsx';
import { type FirstRunAction, type FirstRunNeeds, firstRunCopy } from './home-state.ts';

const actionLabels: Record<FirstRunAction, string> = {
    captain: 'New Captain',
    device: 'Add a device',
    project: 'Create a project',
};

export function HomeFirstRun({
    canManage,
    needsCaptain,
    needsDevice,
    needsProject,
    serverId,
    slug,
}: FirstRunNeeds & {
    canManage: boolean;
    serverId: string;
    slug: string;
}) {
    const navigate = useNavigate();
    const [creating, setCreating] = React.useState<'captain' | 'project' | null>(null);
    const copy = firstRunCopy({ canManage, needsCaptain, needsDevice, needsProject });

    return (
        <>
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={DashboardSquare01Icon} />
                    </EmptyState.Media>
                    <EmptyState.Title>{copy.title}</EmptyState.Title>
                    <EmptyState.Description>{copy.description}</EmptyState.Description>
                </EmptyState.Header>
                {copy.actions.length > 0 ? (
                    <EmptyState.Content>
                        {copy.actions.map((action, index) => (
                            <Button
                                key={action}
                                onPress={() =>
                                    action === 'device'
                                        ? navigate(serverComputersRoute(slug))
                                        : setCreating(action)
                                }
                                variant={index === 0 ? 'primary' : 'secondary'}
                            >
                                {actionLabels[action]}
                            </Button>
                        ))}
                    </EmptyState.Content>
                ) : null}
            </EmptyState>
            <NewProjectDialog
                onClose={() => setCreating(null)}
                onCreated={() => setCreating(null)}
                open={creating === 'project'}
                serverId={serverId}
            />
            {canManage ? (
                <CreateAgentDialog
                    onCreated={() => setCreating(null)}
                    onOpenChange={(open) => setCreating(open ? 'captain' : null)}
                    open={creating === 'captain'}
                    serverId={serverId}
                />
            ) : null}
        </>
    );
}
