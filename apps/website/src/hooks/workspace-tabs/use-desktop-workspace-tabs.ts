import { useBrowserWorkspace } from '../../features/shell/browser-workspace-context.tsx';
import { getDesktopBridge } from '../../lib/desktop-bridge.ts';

/**
 * The window's workspace tabs, on desktop only (ADR 0038). Null on the
 * website, which has no tabs: there chat-scoped surfaces (Files, the Artifact
 * Panel, Threads) open in the chat's own side panel.
 */
export function useDesktopWorkspaceTabs() {
    const workspace = useBrowserWorkspace();
    return workspace && getDesktopBridge()?.browserCommand ? workspace : null;
}
