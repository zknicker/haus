import type { Chat } from '@haus/api';
import { AlertDialog, Button } from '@heroui/react';
import * as React from 'react';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useAgentHomeMove } from '../../hooks/projects/use-agent-home-move.ts';
import { useProjects } from '../../hooks/projects/use-projects.ts';
import { hausProject, projectCaptains } from '../../lib/project-homes.ts';
import { SettingsRowError } from '../settings/layout/settings-text.tsx';

export type ProjectRehomeAction = 'archive' | 'delete';

export function ProjectRehomeDialog({
    action,
    chat,
    onClose,
    onContinue,
}: {
    action: ProjectRehomeAction;
    chat: Chat;
    onClose: () => void;
    onContinue: () => Promise<unknown>;
}) {
    const projects = useProjects(chat.serverId);
    const agents = useAgents(chat.serverId);
    const move = useAgentHomeMove();
    const [pending, startTransition] = React.useTransition();
    const [error, setError] = React.useState<string | null>(null);
    const { captains } = projectCaptains(projects.data ?? [], agents.data ?? [], chat.id);
    const haus = hausProject(projects.data ?? []);
    const names = new Intl.ListFormat(undefined, { type: 'conjunction' }).format(
        captains.map((agent) => agent.displayName)
    );
    const hausName = haus?.name ?? 'haus';

    const confirm = () =>
        startTransition(async () => {
            if (!haus) {
                return;
            }
            setError(null);
            try {
                for (const agent of captains) {
                    await move.mutateAsync({
                        agentId: agent.id,
                        projectId: haus.chatId,
                        serverId: chat.serverId,
                    });
                }
                await onContinue();
                onClose();
            } catch (cause) {
                setError(cause instanceof Error ? cause.message : `The ${action} failed.`);
            }
        });

    return (
        <AlertDialog.Backdrop
            isDismissable={!pending}
            isOpen
            onOpenChange={(open) => !open && onClose()}
        >
            <AlertDialog.Container size="sm">
                <AlertDialog.Dialog>
                    <AlertDialog.Header>
                        <AlertDialog.Icon status="warning" />
                        <AlertDialog.Heading>Move Captains to #{hausName}?</AlertDialog.Heading>
                    </AlertDialog.Header>
                    <AlertDialog.Body>
                        <p>
                            #{chat.name} is home to {names || 'Captains'}. To {action} it, they move
                            home to #{hausName} first.
                        </p>
                        <SettingsRowError>{error}</SettingsRowError>
                    </AlertDialog.Body>
                    <AlertDialog.Footer>
                        <Button isDisabled={pending} slot="close" variant="secondary">
                            Cancel
                        </Button>
                        <Button
                            isDisabled={!haus || captains.length === 0}
                            isPending={pending}
                            onPress={confirm}
                            variant={action === 'delete' ? 'danger' : 'primary'}
                        >
                            Move and {action}
                        </Button>
                    </AlertDialog.Footer>
                </AlertDialog.Dialog>
            </AlertDialog.Container>
        </AlertDialog.Backdrop>
    );
}
