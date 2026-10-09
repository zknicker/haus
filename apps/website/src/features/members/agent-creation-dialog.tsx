import type { Agent, ComputerInventory } from '@haus/api';
import { Alert, Modal, Spinner } from '@heroui/react';
import type * as React from 'react';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { computerLabel } from '../computers/presentation.ts';
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
    const reported: ReportedComputer[] = (computers.data ?? [])
        .filter((computer) => (computer.reportedInventory?.runtimes.length ?? 0) > 0)
        .map((computer) => ({
            id: computer.id,
            inventory: computer.reportedInventory as ComputerInventory,
            label: computerLabel(computer),
        }));

    return (
        <Modal.Backdrop isDismissable isOpen={open} onOpenChange={onOpenChange}>
            <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog>
                    <Modal.CloseTrigger />
                    <Modal.Header>
                        <Modal.Heading>Create Agent</Modal.Heading>
                        <p className="mt-1.5 text-muted text-sm leading-5">
                            Choose where this Agent runs and tune its starting configuration.
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
}: Omit<React.ComponentProps<typeof AgentCreationForm>, 'agents'> & { serverId: string }) {
    const agents = useAgents(serverId).data ?? noAgents;
    return <AgentCreationForm agents={agents} {...props} />;
}

const noAgents: readonly Agent[] = [];
