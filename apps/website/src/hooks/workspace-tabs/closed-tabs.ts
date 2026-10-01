import type { BrowserTab } from '../../lib/desktop-browser.ts';
import {
    type AgentTab,
    type ArtifactTab,
    type ClosableTabRef,
    type ThreadTab,
    type WorkspaceTabRef,
    workspaceTabId,
} from './workspace-tabs-model.ts';

/**
 * A tab closed this session, newest last, for Reopen Closed Tab (⌘⇧T).
 * `index` is its position among the closable tabs when it closed; it reopens
 * there, selected.
 */
export type ClosedTab =
    | {
          kind: 'browser';
          index: number;
          url: string;
          title: string;
          faviconUrl: string | null;
      }
    | { kind: 'agent'; index: number; tab: AgentTab }
    | { kind: 'artifact'; index: number; tab: ArtifactTab }
    | { kind: 'thread'; index: number; tab: ThreadTab };

export const closedTabLimit = 20;

/** The entry to remember for a closing tab; blank new-tab pages are not worth reopening. */
export function closedTabEntry(
    ref: ClosableTabRef,
    strip: readonly WorkspaceTabRef[],
    browserTabs: readonly BrowserTab[],
    artifacts: readonly ArtifactTab[],
    agents: readonly AgentTab[] = []
): ClosedTab | null {
    const index = strip.findIndex((item) => workspaceTabId(item) === workspaceTabId(ref));
    if (index < 0) {
        return null;
    }
    if (ref.kind === 'agent') {
        const tab = agents.find((item) => item.agentId === ref.agentId);
        return tab ? { kind: 'agent', index, tab } : null;
    }
    if (ref.kind === 'artifact') {
        const tab = artifacts.find((item) => item.key === ref.key);
        return tab ? { kind: 'artifact', index, tab } : null;
    }
    if (ref.kind === 'thread') {
        return {
            kind: 'thread',
            index,
            tab: { anchorMessageId: ref.anchorMessageId, chatId: ref.chatId },
        };
    }
    const tab = browserTabs.find((item) => item.id === ref.id);
    if (!tab || tab.url === 'about:blank') {
        return null;
    }
    return {
        kind: 'browser',
        index,
        url: tab.url,
        title: tab.title,
        faviconUrl: tab.faviconUrl,
    };
}

export function rememberClosedTab(stack: readonly ClosedTab[], entry: ClosedTab): ClosedTab[] {
    return [...stack, entry].slice(-closedTabLimit);
}

/** Places `ref` at `index` (clamped) in the strip, moving it if it is already there. */
export function insertTabAt<Ref extends WorkspaceTabRef>(
    strip: readonly Ref[],
    ref: Ref,
    index: number
): Ref[] {
    const id = workspaceTabId(ref);
    const rest = strip.filter((item) => workspaceTabId(item) !== id);
    const at = Math.max(0, Math.min(index, rest.length));
    return [...rest.slice(0, at), ref, ...rest.slice(at)];
}
