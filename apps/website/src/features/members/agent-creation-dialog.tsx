import type { Agent, ComputerInventory, Project } from '@haus/api';
import { Alert, Modal, Spinner } from '@heroui/react';
import type * as React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useOptionalDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { currentOpenGesture } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { useAgents } from '../../hooks/members/use-agents.ts';
import { useComputers } from '../../hooks/servers/use-computers.ts';
import { useProjects } from '../../hooks/servers/use-projects.ts';
import { openSettingsTab } from '../../hooks/shell/use-settings-opener.ts';
import { computerLabel } from '../computers/presentation.ts';
import { serverComputersRoute } from '../servers/server-routes.ts';
import {
    AgentCreationForm,
    type AgentCreationSubmitValues,
    type ReportedComputer,
} from './agent-creation-form.tsx';
import { homeProjectOptions } from './home-project-options.ts';

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
                        <Modal.Heading>Create Captain</Modal.Heading>
                        <p className="text-muted mt-1.5 text-sm leading-5">
                            Choose where this Captain runs and tune its starting configuration.
                        </p>
                    </Modal.Header>
                    {computers.isPending ? (
                        <DialogSpinner />
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
}: Omit<React.ComponentProps<typeof AgentCreationForm>, 'agents' | 'projects'> & {
    serverId: string;
}) {
    const agents = useAgents(serverId).data ?? noAgents;
    const projectList = useProjects(serverId);
    if (projectList.isPending) {
        return <DialogSpinner />;
    }
    if (projectList.error) {
        return <ProjectListError message={projectList.error.message} />;
    }
    const projects = homeProjectOptions(projectList.data ?? noProjects);
    return <AgentCreationForm agents={agents} projects={projects} {...props} />;
}

function DialogSpinner() {
    return (
        <Modal.Body>
            <div className="flex min-h-32 items-center justify-center">
                <Spinner />
            </div>
        </Modal.Body>
    );
}

function ProjectListError({ message }: { message: string }) {
    return (
        <Modal.Body>
            <Alert status="danger">
                <Alert.Indicator />
                <Alert.Content>
                    <Alert.Title>Projects could not load</Alert.Title>
                    <Alert.Description>{message}</Alert.Description>
                </Alert.Content>
            </Alert>
        </Modal.Body>
    );
}

const noAgents: readonly Agent[] = [];
const noProjects: readonly Project[] = [];
