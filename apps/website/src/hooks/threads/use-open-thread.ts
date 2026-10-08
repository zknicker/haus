import {
    type DesktopPageOpeners,
    useDesktopPageOpeners,
} from '../desktop-tabs/use-desktop-page-openers.ts';

export type OpenThread = DesktopPageOpeners['openThread'];

/**
 * The one way to open a Thread on desktop (ADR 0039): a Thread is a page that
 * opens in the right pane (an open Thread tab is selected). Null on the website, which has no
 * tabs: there the open Chat's side pane hosts Threads, and links elsewhere
 * navigate to the Chat with `?thread=`.
 */
export function useOpenThread(): OpenThread | null {
    return useDesktopPageOpeners()?.openThread ?? null;
}
