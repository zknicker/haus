import type { ChatPaneTarget } from '@haus/api';
import {
    formatChatPaneTargetLink,
    isWorkspaceChatPaneTarget,
    parseChatPaneTargetLink,
} from '@haus/api/pane-links';

// Pane targets and the haus:// link scheme are the Runtime contract's; the
// app-local alias adds the authoring Agent for Server workspace targets. The
// link itself remains portable; Server Chat derives ownership from the
// durable message author rather than encoding identity in user-authored text.
export type WorkspaceResourceTarget = Extract<ChatPaneTarget, { kind: `workspace${string}` }> & {
    agentId?: string;
};

/**
 * An Agent's `page` card: the fence's cwd-relative path, read from Drive
 * (`use-drive-page.ts`), at `revisionId` when the message pins one.
 */
export interface DrivePageTarget {
    agentId?: string;
    kind: 'drivePage';
    path: string;
    revisionId?: string;
}

export type HausResourceTarget =
    | DrivePageTarget
    | Exclude<ChatPaneTarget, { kind: `workspace${string}` }>
    | WorkspaceResourceTarget;

export const parseHausResourceLink = parseChatPaneTargetLink;
export const formatHausResourceLink = formatChatPaneTargetLink;
export { isWorkspaceChatPaneTarget };

export function isWorkspaceResourceTarget(
    target: HausResourceTarget
): target is WorkspaceResourceTarget {
    return target.kind !== 'drivePage' && isWorkspaceChatPaneTarget(target);
}

export function getArtifactPanelTargetKey(target: HausResourceTarget) {
    if (target.kind === 'drivePage') {
        return `drivePage:${target.agentId ?? ''}:${target.revisionId ?? ''}:${target.path}`;
    }
    const agentKey = 'agentId' in target && target.agentId ? `${target.agentId}:` : '';
    return `${target.kind}:${agentKey}${target.path}`;
}

export function bindWorkspaceTargetToAgent(
    target: HausResourceTarget,
    agentId: string | undefined
): HausResourceTarget {
    if (!(agentId && (target.kind === 'drivePage' || isWorkspaceResourceTarget(target)))) {
        return target;
    }
    return { ...target, agentId };
}

export function getArtifactPanelTargetLabel(target: HausResourceTarget) {
    // The workspace is one tab; it reads "Workspace" whenever no file is open.
    if (target.kind === 'workspaceDirectory' || target.kind === 'workspaceRoot') {
        return 'Workspace';
    }

    const label = target.path.split('/').filter(Boolean).at(-1);
    return label && label.length > 0 ? label : target.path;
}
