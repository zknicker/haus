import type { Agent } from '@haus/api';
import { EmptyState } from '@heroui-pro/react';
import { ComputerIcon, Folder01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../../../components/ui/icon.tsx';
import { useComputers } from '../../../hooks/servers/use-computers.ts';
import type { ServerDetail } from '../../../lib/haus-server.tsx';
import { WorkspaceBrowserContent } from '../../chats/chat-artifact-workspace-content.tsx';
import { normalizeWorkspacePath } from '../../chats/chat-artifact-workspace-model.ts';
import {
    type WorkspaceBarPlacement,
    WorkspacePageToolbar,
} from '../../chats/chat-artifact-workspace-toolbar.tsx';
import { AgentReminders } from './agent-reminders.tsx';
import { AgentTriggers } from './agent-triggers.tsx';

export { AgentActivity } from './agent-activity.tsx';

/**
 * Both of an Agent's standing automations in one section: Reminders answer "at this
 * time", Triggers answer "when this outside thing happens". One section, because a
 * reader asking "what wakes this Agent on its own?" is asking one question.
 *
 * Each section owns its own query, so a slow one never blanks the other.
 */
export function AgentAutomations({ agent, server }: { agent: Agent; server: ServerDetail }) {
    return (
        <>
            <AgentReminders agent={agent} server={server} />
            <AgentTriggers agent={agent} server={server} />
        </>
    );
}

export type WorkspaceAvailability = 'available' | 'computer-offline' | 'loading' | 'restricted';

/**
 * Workspace data always comes from the Agent's Computer, so the browser can
 * only resolve once we know that Computer is actually reachable. Without
 * this gate, an offline Computer leaves the workspace query pending forever
 * and the tab is stuck showing "Loading workspace files…".
 */
export function resolveWorkspaceAvailability({
    computerId,
    computers,
    role,
}: {
    computerId: string;
    computers:
        | Array<{
              health: 'degraded' | 'healthy' | 'offline' | 'update-required';
              id: string;
          }>
        | undefined;
    role: ServerDetail['role'];
}): WorkspaceAvailability {
    if (role === 'member') {
        return 'restricted';
    }
    if (!computers) {
        return 'loading';
    }
    const computer = computers.find((candidate) => candidate.id === computerId);
    return computer?.health === 'healthy' ? 'available' : 'computer-offline';
}

export function AgentWorkspace({
    agent,
    barPlacement,
    server,
    toolbarLeading,
    menuSections,
}: {
    agent: Agent;
    /** Where the Workspace's one bar renders: the profile's shell band on the
        web, over the content column in a desktop tab. The host decides. */
    barPlacement: Extract<WorkspaceBarPlacement, 'band' | 'column'>;
    server: ServerDetail;
    /** The host's breadcrumb and menu sections for the Workspace's one bar. */
    toolbarLeading?: React.ReactNode;
    menuSections?: React.ReactNode;
}) {
    const canView = server.role !== 'member';
    const computers = useComputers(server.id, { enabled: canView });
    const availability = resolveWorkspaceAvailability({
        computerId: agent.computerId,
        computers: computers.data,
        role: server.role,
    });
    const openFile = useWorkspaceFileParam();

    // An unbrowsable workspace keeps its bar, so the way back and the
    // Agent's menu never vanish with the files.
    const unavailableBar = (
        <WorkspacePageToolbar
            leading={toolbarLeading}
            menuSections={menuSections}
            placement={barPlacement}
            selectedPath={null}
            title={null}
        />
    );

    if (availability === 'restricted') {
        return (
            <TabEmptyState
                bar={unavailableBar}
                description="Only workspace owners and admins can inspect raw Agent workspace files."
                icon={Folder01Icon}
                title="Workspace Unavailable"
            />
        );
    }

    if (availability === 'computer-offline') {
        return (
            <TabEmptyState
                bar={unavailableBar}
                description={`Workspace files will be browsable again once ${agent.displayName}'s Computer reconnects.`}
                icon={ComputerIcon}
                title="Computer Offline"
            />
        );
    }

    return (
        // Full-bleed: the file rail sits at the primary sidebar's width while
        // sharing the workspace content ground rather than forming another
        // block of app-sidebar chrome.
        <WorkspaceBrowserContent
            agentId={agent.id}
            onSelectPath={openFile.select}
            pageBarPlacement={barPlacement}
            pageMenuSections={menuSections}
            pageTitle={null}
            pageToolbarLeading={toolbarLeading}
            railVariant="sidebar"
            selectedPath={openFile.path}
            serverId={server.id}
            treeSide="end"
        />
    );
}

/**
 * The open workspace file as the `file` search param, so it survives a reload
 * and a tab moving to another window. Switching files replaces the entry:
 * Back leaves the workspace rather than stepping through every file viewed.
 */
function useWorkspaceFileParam() {
    const [searchParams, setSearchParams] = useSearchParams();
    const path = normalizeWorkspacePath(searchParams.get('file') ?? '') || null;
    const select = React.useCallback(
        (next: null | string) => {
            setSearchParams(
                (params) => {
                    const updated = new URLSearchParams(params);
                    const normalized = next ? normalizeWorkspacePath(next) : '';
                    if (normalized) {
                        updated.set('file', normalized);
                    } else {
                        updated.delete('file');
                    }
                    return updated;
                },
                { replace: true }
            );
        },
        [setSearchParams]
    );
    return { path, select };
}

function TabEmptyState({
    bar,
    description,
    icon,
    title,
}: {
    bar: React.ReactNode;
    description: string;
    icon: Parameters<typeof Icon>[0]['icon'];
    title: string;
}) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            {bar}
            <EmptyState>
                <EmptyState.Header>
                    <EmptyState.Media variant="icon">
                        <Icon icon={icon} />
                    </EmptyState.Media>
                    <EmptyState.Title>{title}</EmptyState.Title>
                    <EmptyState.Description>{description}</EmptyState.Description>
                </EmptyState.Header>
            </EmptyState>
        </div>
    );
}
