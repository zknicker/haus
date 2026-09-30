import { Button } from '@heroui/react';
import { Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import { type BrowserRecentSite, selectRecentSites } from './browser-recent-sites.ts';
import { useBrowserWorkspace } from './browser-workspace-context.tsx';

/**
 * The new-tab page: recently visited sites as a row of tiles, a third of the way down. The
 * focused address field above already invites a search, so without history the page is blank.
 * Tile geometry lives on `.browser-start-site` in `styles/default-theme.css`.
 */
export function BrowserStartPage() {
    const workspace = useBrowserWorkspace();
    const sites = React.useMemo(
        () => selectRecentSites(workspace?.history ?? []),
        [workspace?.history]
    );
    if (!(workspace && sites.length)) {
        return null;
    }
    return (
        <div className="absolute inset-0 grid grid-rows-[1fr_auto_2fr] justify-items-center overflow-y-auto px-4">
            <nav aria-label="Recent sites" className="row-start-2 max-w-3xl">
                <ul className="flex flex-wrap justify-center gap-1">
                    {sites.map((site) => (
                        <li className="browser-start-site" key={site.origin}>
                            <Button
                                onPress={() =>
                                    workspace.command({
                                        kind: 'navigate',
                                        action: 'url',
                                        url: site.url,
                                    })
                                }
                                variant="ghost"
                            >
                                <SiteMark site={site} />
                                <span className="browser-start-site__label">{site.label}</span>
                            </Button>
                        </li>
                    ))}
                </ul>
            </nav>
        </div>
    );
}

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
