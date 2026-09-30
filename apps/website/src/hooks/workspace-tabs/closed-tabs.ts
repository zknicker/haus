import type { BrowserTab } from '../../lib/desktop-browser.ts';
import {
    type ArtifactTab,
    type ClosableTabRef,
    type WorkspaceTabRef,
    workspaceTabId,
} from './workspace-tabs-model.ts';

/**
 * A tab closed this session, newest last, for Reopen Closed Tab (⌘⇧T).
 * `index` is its position in the whole strip, primary tab included, when it closed.
 */
export type ClosedTab =
    | {
          kind: 'browser';
          index: number;
          url: string;
          title: string;
          faviconUrl: string | null;
      }
    | { kind: 'artifact'; index: number; tab: ArtifactTab };

export const closedTabLimit = 20;

/** The entry to remember for a closing tab; blank new-tab pages are not worth reopening. */
export function closedTabEntry(
    ref: ClosableTabRef,
    strip: readonly WorkspaceTabRef[],
    browserTabs: readonly BrowserTab[],
    artifacts: readonly ArtifactTab[]
): ClosedTab | null {
    const index = strip.findIndex((item) => workspaceTabId(item) === workspaceTabId(ref));
    if (index < 0) {
        return null;
    }
    if (ref.kind === 'artifact') {
        const tab = artifacts.find((item) => item.key === ref.key);
        return tab ? { kind: 'artifact', index, tab } : null;
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
export function insertTabAt(
    strip: readonly WorkspaceTabRef[],
    ref: WorkspaceTabRef,
    index: number
): WorkspaceTabRef[] {
    const id = workspaceTabId(ref);
    const rest = strip.filter((item) => workspaceTabId(item) !== id);
    const at = Math.max(0, Math.min(index, rest.length));
    return [...rest.slice(0, at), ref, ...rest.slice(at)];
}
