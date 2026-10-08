import { Button, Toolbar, toast } from '@heroui/react';
import { Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { newBrowserLocation } from '../../hooks/browser/browser-view-tabs.ts';
import { useBrowserViews } from '../../hooks/browser/browser-views-context.ts';
import type { BrowserHistoryEntry } from '../../hooks/browser/use-browser-history.ts';
import { useDesktopTabCommands } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { useTabPresence } from '../../hooks/desktop-tabs/tab-presence.ts';
import { cn } from '../../lib/utils.ts';
import { resolveBrowserAddress } from './browser-address.ts';
import { type BrowserRecentSite, selectRecentSites } from './browser-recent-sites.ts';
import { BrowserWorkspaceAddress } from './browser-workspace-address.tsx';
import { PageHistoryButtons } from './browser-workspace-navigation.tsx';
import { pageToolbarClassName } from './page-toolbar.tsx';

/**
 * The new tab page (⌘T, a row's plus; ADR 0039): a pure browser start page.
 * The address field sits where a web page's toolbar puts it and takes focus
 * whenever the page is shown in the focused pane; recently visited sites sit
 * a third of the way down. Going somewhere pushes a web page onto this same
 * tab, so Back returns here. Chats stay with the sidebar and ⌘K.
 */
export function NewTabPage({ className, tabId }: { className?: string; tabId: string }) {
    const browser = useBrowserViews();
    const { navigate } = useDesktopTabCommands();
    const { focusedPane, shown } = useTabPresence();
    // null while the field is at rest; the page has no address of its own.
    const [draft, setDraft] = React.useState<string | null>(null);
    const history = browser?.history ?? noHistory;
    const sites = React.useMemo(() => selectRecentSites(history), [history]);
    const addressId = `new-tab-address-${tabId}`;
    const go = (url: string, title?: string) => {
        let location: ReturnType<typeof newBrowserLocation>;
        try {
            location = newBrowserLocation(url);
        } catch {
            toast.danger('Not a web address', { description: url });
            return;
        }
        setDraft(null);
        navigate(tabId, title ? { ...location, title } : location, 'push');
    };
    const focusAddress = shown && focusedPane;
    React.useEffect(() => {
        if (focusAddress) {
            document.getElementById(addressId)?.focus();
        }
    }, [addressId, focusAddress]);
    return (
        <section
            aria-label="New tab"
            className={cn('flex min-h-0 flex-col bg-background', className)}
        >
            <form
                className={`${pageToolbarClassName} browser-toolbar grid shrink-0 grid-cols-[auto_minmax(0,1fr)] items-center`}
                onSubmit={(event) => event.preventDefault()}
            >
                <Toolbar aria-label="Page navigation">
                    <PageHistoryButtons view={null} />
                </Toolbar>
                <BrowserWorkspaceAddress
                    address={draft ?? ''}
                    editing={draft !== null}
                    history={history}
                    id={addressId}
                    onChange={setDraft}
                    onEdit={() => setDraft('')}
                    onNavigate={(value) => go(resolveBrowserAddress(value))}
                    onRest={() => setDraft(null)}
                />
            </form>
            {sites.length ? (
                <div className="grid min-h-0 flex-1 grid-rows-[1fr_auto_2fr] justify-items-center overflow-y-auto px-4">
                    <nav aria-label="Recent sites" className="row-start-2 max-w-3xl">
                        <ul className="flex flex-wrap justify-center gap-1">
                            {sites.map((site) => (
                                <li className="browser-start-site" key={site.origin}>
                                    <Button
                                        onPress={() => go(site.url, site.label)}
                                        variant="ghost"
                                    >
                                        <SiteMark site={site} />
                                        <span className="browser-start-site__label">
                                            {site.label}
                                        </span>
                                    </Button>
                                </li>
                            ))}
                        </ul>
                    </nav>
                </div>
            ) : null}
        </section>
    );
}

const noHistory: BrowserHistoryEntry[] = [];

/** The site's favicon on a neutral chip, or a globe when it has none or it fails to load. */
function SiteMark({ site }: { site: BrowserRecentSite }) {
    const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
    const url = site.faviconUrl;
    return (
        <span aria-hidden="true" className="browser-start-site__mark">
            {url && url !== failedUrl ? (
                // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Image load failure is not a user interaction.
                <img
                    alt=""
                    draggable={false}
                    height={20}
                    onError={() => setFailedUrl(url)}
                    referrerPolicy="no-referrer"
                    src={url}
                    width={20}
                />
            ) : (
                <Icon icon={Globe02Icon} size={20} />
            )}
        </span>
    );
}
