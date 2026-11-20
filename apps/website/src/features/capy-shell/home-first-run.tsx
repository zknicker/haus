import { EmptyState } from '@heroui-pro/react';
import { Button } from '@heroui/react';
import { DashboardSquare01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { CreateAgentDialog } from '../members/create-agent-dialog.tsx';
import { NewProjectDialog } from '../shell/new-project-dialog.tsx';
import { type FirstRunAction, firstRunCopy } from './home-state.ts';

const actionLabels: Record<FirstRunAction, string> = {
    captain: 'New Captain',
    project: 'Create a project',
};

export function HomeFirstRun({
    canManage,
    needsCaptain,
    needsProject,
    serverId,
}: {
    canManage: boolean;
    needsCaptain: boolean;
    needsProject: boolean;
    serverId: string;
}) {
    const [creating, setCreating] = React.useState<FirstRunAction | null>(null);
    const copy = firstRunCopy({ canManage, needsCaptain, needsProject });

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
                                onPress={() => setCreating(action)}
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
