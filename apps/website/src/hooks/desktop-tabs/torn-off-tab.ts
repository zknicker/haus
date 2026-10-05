import { getDesktopBridge } from '../../lib/desktop-bridge.ts';
import type { TabBundle } from './desktop-tabs-model.ts';
import { parseTabBundle } from './desktop-tabs-storage.ts';

let claimed: { bundle: TabBundle | null; serverId: string } | null = null;

/**
 * The tabs this window was torn off with (ADR 0039), asked of Electron once
 * per page load: Electron hands them over only once, and StrictMode runs the
 * tab state's initializer twice. Null for any other window or Server.
 */
export function claimTornOffTabs(serverId: string): TabBundle | null {
    if (!claimed) {
        const value = getDesktopBridge()?.tabDragClaim?.(serverId) ?? null;
        claimed = { bundle: parseTabBundle(value), serverId };
    }
    return claimed.serverId === serverId ? claimed.bundle : null;
}
