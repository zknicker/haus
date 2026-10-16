import * as React from 'react';
import { useOptionalDesktopTabs } from '../desktop-tabs/desktop-tabs-context.ts';
import { announceWebProviderReturn } from './web-provider-return.ts';

/** Page loads already offered, so a remount never offers the same landing twice. */
const offered = new Set<string>();

/**
 * Web only: while `landed` (the page carries a provider callback's outcome),
 * offers this page to the tab that started the flow and closes this tab once
 * that tab claims it. Unclaimed, or when the browser refuses to close a tab,
 * this page keeps showing the outcome in place. Desktop returns never land in
 * the App window (`desktop-provider-tab.ts`).
 */
export function useProviderReturnLanding(landed: boolean) {
    const desktop = useOptionalDesktopTabs() !== null;
    React.useEffect(() => {
        if (!landed || desktop) {
            return;
        }
        const { hash, href, pathname, search } = window.location;
        if (offered.has(href)) {
            return;
        }
        offered.add(href);
        void announceWebProviderReturn(`${pathname}${search}${hash}`).then((claimed) => {
            if (claimed) {
                window.close();
            }
        });
    }, [desktop, landed]);
}
