import type { BrowserBounds } from './desktop-browser.ts';

/**
 * The App ↔ Electron contract for dragging tabs between windows (ADR 0039).
 * Points are client CSS px of the receiving window. The dragged tabs (one, or
 * a multi-selection) cross as one `TabBundle`, typed `unknown` here and
 * validated by the receiving window (`parseTabBundle`).
 */
export interface TabDragPoint {
    x: number;
    y: number;
}

export interface TabDragStart {
    bundle: unknown;
    /** Where a torn-off window boots before it claims the tabs. */
    route: string;
    serverId: string;
}

export interface TabDragDetach {
    /**
     * Where the active tab's web page sits in a one-pane window of this size, if it shows one,
     * so a torn-off window shows the live page at once (`detachedPageBounds`).
     */
    body: BrowserBounds | null;
    bundle: unknown;
    /** The pointer's offset from the dragged tabs' top left. */
    grab: TabDragPoint;
    /** The window's every tab is dragging: the window itself travels with the cursor. */
    keepsWindow: boolean;
    /** Where a torn-off window's first tab sits (its first row's first slot), for placing it under the cursor. */
    slot: TabDragPoint;
}

/** A window's band, so other windows' drags can find it. */
export interface TabStripReport {
    rect: { height: number; width: number; x: number; y: number };
    serverId: string;
}

/** Electron → the window the tab is over (or the pressing window). */
export type TabDragMessage =
    /** The dragged tabs entered this window's band at `point`. */
    | { bundle: unknown; grab: TabDragPoint; kind: 'attach'; point: TabDragPoint }
    /** The cursor, while relayed tabs ride this window's band. */
    | { kind: 'move'; point: TabDragPoint }
    /** The pointer came up over this window: the relayed tabs land. */
    | { kind: 'release' }
    /** Escape while the tabs rode this window: they go back where they came from. */
    | { kind: 'withdraw'; tabIds: readonly string[] }
    /**
     * Escape: the pressing window takes its tabs back where they started. Sent
     * before their web views return, so the window names them first.
     */
    | { bundle: unknown; kind: 'restore' }
    /** The session ended without this window's say (a window closed, a renderer crashed). */
    | { kind: 'end' }
    /** Report the band again (`TabStripReport`). */
    | { kind: 'measure' };

export function parseTabDragMessage(value: unknown): TabDragMessage | null {
    if (!(value && typeof value === 'object' && 'kind' in value)) {
        return null;
    }
    const message = value as Record<string, unknown>;
    switch (message.kind) {
        case 'attach':
            return isPoint(message.point) && isPoint(message.grab) && 'bundle' in message
                ? {
                      bundle: message.bundle,
                      grab: message.grab,
                      kind: 'attach',
                      point: message.point,
                  }
                : null;
        case 'move':
            return isPoint(message.point) ? { kind: 'move', point: message.point } : null;
        case 'withdraw':
            return Array.isArray(message.tabIds) &&
                message.tabIds.every((id) => typeof id === 'string')
                ? { kind: 'withdraw', tabIds: message.tabIds as string[] }
                : null;
        case 'restore':
            return 'bundle' in message ? { bundle: message.bundle, kind: 'restore' } : null;
        case 'release':
        case 'end':
        case 'measure':
            return { kind: message.kind };
        default:
            return null;
    }
}

/** Electron's answer to a detach: whether this window keeps the tabs (it travels with them). */
export function parseDetachReply(value: unknown): { keepsTab: boolean } | null {
    return value &&
        typeof value === 'object' &&
        'keepsTab' in value &&
        typeof value.keepsTab === 'boolean'
        ? { keepsTab: value.keepsTab }
        : null;
}

function isPoint(value: unknown): value is TabDragPoint {
    return (
        typeof value === 'object' &&
        value !== null &&
        'x' in value &&
        'y' in value &&
        Number.isFinite(value.x) &&
        Number.isFinite(value.y)
    );
}
