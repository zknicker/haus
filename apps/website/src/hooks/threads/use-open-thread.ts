import { useBrowserWorkspace } from '../../features/shell/browser-workspace-context.tsx';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { WorkspaceTabOpeners } from '../workspace-tabs/use-workspace-tab-openers.ts';

export type OpenThread = WorkspaceTabOpeners['openThread'];

/**
 * The one way to open a Thread on desktop (ADR 0038, threads are companions):
 * opens or selects the Thread's tab, in the split as its preview tab unless
 * `placement: 'main'` (Cmd-click) forces the main strip. Null on the website,
 * which has no tabs: there the open Chat's side pane hosts Threads, and links
 * elsewhere navigate to the Chat with `?thread=`.
 */
export function useOpenThread(): OpenThread | null {
    const openThread = useBrowserWorkspace()?.openThread;
    return openThread && getDesktopBridge()?.browserCommand ? openThread : null;
}
