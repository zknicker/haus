import type { DesktopTabCommands } from './desktop-tabs-context.ts';
import type { TabLocation } from './desktop-tabs-model.ts';
import { tabPageKey } from './desktop-tabs-model.ts';
import type { OpenGesture } from './tab-open-gesture.ts';

/**
 * Who is navigating (ADR 0039). `page`: a page inside a tab, where a push to another page
 * is Open and a push to its own page a drill-down that stays in the tab (a Settings
 * section, a search filter). `shell`: window chrome (the sidebar, the command menu), where
 * every push is Go, whichever tab chrome happens to read its page from.
 */
export type TabNavigationPolicy = 'page' | 'shell';

/** What a router navigator call turns into. */
export type TabNavigationOutcome =
    | { kind: 'navigate'; mode: 'push' | 'replace' }
    | { kind: 'goTo' }
    | { kind: 'open' }
    | { background: boolean; kind: 'openTab' };

/**
 * Router state key that carries a gesture through a plain `navigate(to, { state })` or
 * `<Link state>`, for a handler that navigates after an `await`. The web App ignores it.
 */
export const tabIntentStateKey = 'hausTabIntent';

/** `navigate(to, { state: tabIntentState(gesture) })`, the gesture read at click time. */
export function tabIntentState(
    gesture: OpenGesture
): Record<typeof tabIntentStateKey, OpenGesture> {
    return { [tabIntentStateKey]: gesture };
}

export function readTabIntent(state: unknown): OpenGesture | null {
    if (state && typeof state === 'object' && tabIntentStateKey in state) {
        const value = (state as Record<string, unknown>)[tabIntentStateKey];
        if (value === 'newTab' || value === 'backgroundTab' || value === 'auto') {
            return value;
        }
    }
    return null;
}

/**
 * The one routing decision for a navigator call. Replace stays in the tab; a modified push
 * opens a tab beside the source (never deduped); window chrome's plain push is always Go; a
 * page's plain push stays in the tab for its own page key and is Open for another.
 */
export function resolveTabNavigation(input: {
    from: TabLocation;
    gesture: OpenGesture;
    mode: 'push' | 'replace';
    policy: TabNavigationPolicy;
    to: TabLocation;
}): TabNavigationOutcome {
    if (input.mode === 'replace') {
        return { kind: 'navigate', mode: 'replace' };
    }
    if (input.gesture !== 'auto') {
        return { background: input.gesture === 'backgroundTab', kind: 'openTab' };
    }
    if (input.policy === 'shell') {
        return { kind: 'goTo' };
    }
    return tabPageKey(input.from) === tabPageKey(input.to)
        ? { kind: 'navigate', mode: 'push' }
        : { kind: 'open' };
}

/**
 * Open with a gesture: plain is Open (the right pane), ⌘- or middle-click a background tab
 * after `fromTabId`, Shift a selected one. `fromTabId` null: window chrome.
 */
export function openWithGesture(
    tabs: Pick<DesktopTabCommands, 'open' | 'openTab'>,
    fromTabId: string | null,
    location: TabLocation,
    gesture: OpenGesture
) {
    if (gesture === 'auto') {
        tabs.open(fromTabId, location);
    } else {
        tabs.openTab(fromTabId, location, { background: gesture === 'backgroundTab' });
    }
}
