import type { Agent, ComputerInventory } from '@haus/api';
import { Alert, Modal, Spinner } from '@heroui/react';
import type * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOptionalDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useModelConnections } from '../../hooks/servers/use-model-connections.ts';
import { openSettingsTab } from '../../hooks/shell/use-settings-opener.ts';
import { computerLabel } from '../computers/presentation.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';
import {
    AgentCreationForm,
    type AgentCreationSubmitValues,
    type ReportedComputer,
} from './agent-creation-form.tsx';

interface AgentCreationDialogProps {
    error: { message: string } | null;
    isPending: boolean;
    onCreated: (agentId: string) => void;
    onOpenChange: (open: boolean) => void;
    onSubmit: (values: AgentCreationSubmitValues) => Promise<{ agentId: string }>;
    open: boolean;
    serverId: string;
}

export function AgentCreationDialog({
    error,
    isPending,
    onCreated,
    onOpenChange,
    onSubmit,
    open,
    serverId,
}: AgentCreationDialogProps) {
    const computers = useComputers(serverId, { enabled: open });
    const modelConnections = useModelConnections(serverId, { enabled: open }).data;
    const runnerModels =
        modelConnections?.agentLoop === 'runner' ? (modelConnections.runnerModels ?? []) : null;
    const navigate = useNavigate();
    const tabs = useOptionalDesktopTabs();
    const { slug } = useParams();
    const addDevice = slug
        ? () => {
              onOpenChange(false);
              const path = serverComputersRoute(slug);
              if (tabs) {
                  openSettingsTab(tabs, path, currentOpenGesture());
              } else {
                  navigate(path);
              }
          }
        : undefined;
    const reported: ReportedComputer[] = (computers.data ?? [])
        .map((computer) => ({
            id: computer.id,
            inventory: {
                ...(computer.reportedInventory ?? {}),
                runtimes: runnerModels ?? computer.reportedInventory?.runtimes ?? [],
            } as ComputerInventory,
            label: computerLabel(computer),
        }))
        .filter((computer) => computer.inventory.runtimes.length > 0);

    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Create Captain</Modal.Heading>
                        <p className="text-muted mt-1.5 text-sm leading-5">
                            Choose where this Captain runs and tune its starting configuration.
                        </p>
                    </Modal.Header>
                    {computers.isPending ? (
                        <Modal.Body>
                            <div className="flex min-h-32 items-center justify-center">
                                <Spinner />
                            </div>
                        </Modal.Body>
                    ) : computers.error ? (
                        <Modal.Body>
                            <Alert status="danger">
                                <Alert.Indicator />
                                <Alert.Content>
                                    <Alert.Description>{computers.error.message}</Alert.Description>
                                </Alert.Content>
                            </Alert>
                        </Modal.Body>
                    ) : (
                        <ServerAgentCreationForm
                            error={error}
                            isPending={isPending}
                            onAddDevice={addDevice}
                            onCreated={onCreated}
                            onSubmit={onSubmit}
                            reported={reported}
                            serverId={serverId}
                        />
                    )}
                </Modal.Dialog>
            </Modal.Container>
        </Modal.Backdrop>
    );
}

/**
 * The form with the Server's Agents (it starts from Cove's configuration). It
 * mounts only while the dialog is open, so the closed dialog the sidebar keeps
 * does not re-render with every Agent turn.
 */
function ServerAgentCreationForm({
    serverId,
    ...props
}: Omit<React.ComponentProps<typeof AgentCreationForm>, 'agents'>) {
    const agents = useAgents(serverId).data ?? noAgents;
    return <AgentCreationForm agents={agents} serverId={serverId} {...props} />;
}

const noAgents: readonly Agent[] = [];
