import type { TabLocation } from './desktop-tabs-model.ts';
import { tabPageKey } from './desktop-tabs-model.ts';
import { type OpenGestureEvent, openIntentFromEvent } from './tab-open-gesture.ts';

/**
 * Why a tab navigates (ADR 0039). `auto` follows the window's rules (the
 * destination's `pagePlacement`, then two panes: the other pane; one pane: the place rule). `backgroundTab` is Command- or
 * middle-click, `newTab` adds Shift (`tab-open-gesture.ts`). `here` forces the current tab (a
 * page's own drill-down that happens to change page key, such as an Agent hub card).
 */
export type TabOpenIntent = 'auto' | 'backgroundTab' | 'here' | 'newTab';

/**
 * Who is navigating. `page`: a page inside a tab, where a cross-page push is a
 * link. `shell`: window chrome (sidebar, command menu, settings rail) bound to
 * the focused pane's current tab, where a push goes to a place (`openInFocusedPane`
 * `current`: an existing tab on that page, else that tab unless it shows a web page).
 */
export type TabNavigationPolicy = 'page' | 'shell';

/** How window chrome opens a page: a place, a new tab after the current one, or ⌘T's tab at the end. */
export type FocusedPaneOpenIntent = 'backgroundTab' | 'current' | 'newTab' | 'newTabAtEnd';

/** What a router navigator call turns into. */
export type TabNavigationOutcome =
    | { kind: 'navigate'; mode: 'push' | 'replace' }
    | { kind: 'openLink'; intent: Exclude<TabOpenIntent, 'here'> }
    | { kind: 'openInFocusedPane'; intent: 'backgroundTab' | 'current' | 'newTab' };

/**
 * Router state key that carries intent through a plain `navigate(to, { state })`
 * or `<Link state>`, so existing call sites keep using React Router. The web
 * App ignores it.
 */
export const tabIntentStateKey = 'hausTabIntent';

/** `navigate(to, { state: tabIntentState(event) })`: a new-tab gesture opens a new tab. */
export function tabIntentState(
    event: OpenGestureEvent | null | undefined
): Record<typeof tabIntentStateKey, TabOpenIntent> {
    return { [tabIntentStateKey]: openIntentFromEvent(event) };
}

export function readTabIntent(state: unknown): TabOpenIntent {
    if (state && typeof state === 'object' && tabIntentStateKey in state) {
        const value = (state as Record<string, unknown>)[tabIntentStateKey];
        if (
            value === 'newTab' ||
            value === 'backgroundTab' ||
            value === 'here' ||
            value === 'auto'
        ) {
            return value;
        }
    }
    return 'auto';
}

/**
 * The one routing decision for a navigator call. Replace never leaves the tab
 * (redirects, search-param drill-down). A page push to the same page key stays
 * in the tab; to another page it is a link.
 */
export function resolveTabNavigation(input: {
    from: TabLocation;
    intent: TabOpenIntent;
    mode: 'push' | 'replace';
    policy: TabNavigationPolicy;
    to: TabLocation;
}): TabNavigationOutcome {
    if (input.policy === 'shell') {
        // Window chrome keeps the gesture: background for Command- or middle-click, selected with Shift.
        if (input.intent === 'newTab' || input.intent === 'backgroundTab') {
            return { kind: 'openInFocusedPane', intent: input.intent };
        }
        // Replace (a chrome redirect) stays in the tab; a push is going to a place.
        return input.mode === 'replace'
            ? { kind: 'navigate', mode: 'replace' }
            : { kind: 'openInFocusedPane', intent: 'current' };
    }
    if (input.intent === 'newTab' || input.intent === 'backgroundTab') {
        return { kind: 'openLink', intent: input.intent };
    }
    if (input.mode === 'replace' || input.intent === 'here') {
        return { kind: 'navigate', mode: input.mode };
    }
    return tabPageKey(input.from) === tabPageKey(input.to)
        ? { kind: 'navigate', mode: 'push' }
        : { kind: 'openLink', intent: 'auto' };
}
