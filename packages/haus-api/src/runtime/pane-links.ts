import { type ChatPaneTarget, chatPaneTargetKey } from './contracts.ts';

// The haus:// link scheme for chat pane targets. This is the one shared
// parser for every consumer of the scheme — app link clicks and the Runtime
// pane_open agent tool must agree on what a link means and what is unsafe.

export function isWorkspaceChatPaneTarget(
    target: ChatPaneTarget
): target is Extract<ChatPaneTarget, { kind: `workspace${string}` }> {
    return (
        target.kind === 'workspaceFile' ||
        target.kind === 'workspaceDirectory' ||
        target.kind === 'workspaceRoot'
    );
}

// Open semantics shared by user gestures and agent UI intents. Workspace
// targets merge into one workspace tab (tree + open file): a file open
// replaces that tab in place, a directory or root open focuses it without
// clobbering the open file. Everything else appends-or-focuses by key.
export function mergeChatPaneOpenTarget(
    targets: ChatPaneTarget[],
    target: ChatPaneTarget
): { activeKey: string; targets: ChatPaneTarget[] } {
    const key = chatPaneTargetKey(target);
    if (targets.some((candidate) => chatPaneTargetKey(candidate) === key)) {
        return { activeKey: key, targets };
    }

    if (isWorkspaceChatPaneTarget(target)) {
        const workspaceIndex = targets.findIndex(isWorkspaceChatPaneTarget);
        const workspaceTarget = targets[workspaceIndex];
        if (workspaceTarget) {
            if (target.kind !== 'workspaceFile') {
                return { activeKey: chatPaneTargetKey(workspaceTarget), targets };
            }
            return {
                activeKey: key,
                targets: targets.map((candidate, index) =>
                    index === workspaceIndex ? target : candidate
                ),
            };
        }
    }

    return { activeKey: key, targets: [...targets, target] };
}

export function parseChatPaneTargetLink(href: string): ChatPaneTarget | null {
    let url: URL;

    if (/[\\/]\.{1,2}(?:[\\/]|$)/u.test(href)) {
        return null;
    }

    try {
        url = new URL(href);
    } catch {
        return null;
    }

    if (url.protocol !== 'haus:' || url.search || url.hash) {
        return null;
    }

    const path = parseTargetPath(url.pathname);
    if (path === null) {
        return null;
    }

    switch (url.hostname) {
        case 'workspace':
            return path
                ? { kind: 'workspaceFile', path }
                : { kind: 'workspaceDirectory', path: '' };
        default:
            return null;
    }
}

export function formatChatPaneTargetLink(target: ChatPaneTarget) {
    const host = 'workspace';
    const path = target.path
        .split('/')
        .filter(Boolean)
        .map((segment) => encodeURIComponent(segment))
        .join('/');

    return `haus://${host}/${path}`;
}

function parseTargetPath(pathname: string) {
    if (!pathname.startsWith('/') || pathname.startsWith('//')) {
        return null;
    }

    let path: string;

    try {
        path = decodeURIComponent(pathname.slice(1));
    } catch {
        return null;
    }

    if (
        path.startsWith('/') ||
        path.startsWith('\\') ||
        (path.length > 0 &&
            path.split('/').some((segment) => segment === '..' || segment.length === 0))
    ) {
        return null;
    }

    return path;
}
