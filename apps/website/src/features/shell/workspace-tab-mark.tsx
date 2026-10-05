import { Spinner } from '@heroui/react';
import { File01Icon, Folder01Icon, Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import { getSectionTabIcon } from './route-tab-presentation.tsx';
import type { TabMark } from './tab-identity.ts';
import { WorkspaceTabMark } from './workspace-tab.tsx';

/** Glyphs and favicons are 16px, centered in the tab's 20px mark slot. */
const markSize = 16;
/** Identity marks — a channel box or an avatar — fill the 20px slot: a boxed mark needs the extra size to read level with a bare favicon. */
const identityMarkSize = 20;

/**
 * A desktop tab's mark from its identity (ADR 0039): a channel box or an
 * avatar at identity size, a section, artifact, Files, or new tab glyph, or
 * a web page's favicon.
 */
export function TabIdentityMark({ mark }: { mark: TabMark }) {
    switch (mark.kind) {
        case 'channel':
            return (
                <WorkspaceTabMark>
                    <ChannelIconBox color={mark.color} icon={mark.icon} size="tab" />
                </WorkspaceTabMark>
            );
        case 'avatar':
            return (
                <WorkspaceTabMark>
                    <EntityAvatar name={mark.name} size={identityMarkSize} src={mark.src} />
                </WorkspaceTabMark>
            );
        case 'favicon':
            return <BrowserTabMark tab={{ faviconUrl: mark.url, loading: mark.loading }} />;
        case 'glyph':
            return (
                <WorkspaceTabMark>
                    <Icon aria-hidden="true" icon={glyphIcon(mark.glyph)} size={markSize} />
                </WorkspaceTabMark>
            );
        case 'none':
            return <WorkspaceTabMark>{null}</WorkspaceTabMark>;
    }
}

/**
 * A browser tab's mark: a spinner while the page loads, then the page's own
 * favicon, falling back to a globe when the page has none or it fails to load.
 */
function BrowserTabMark({ tab }: { tab: Pick<BrowserTab, 'faviconUrl' | 'loading'> }) {
    const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
    let mark: React.ReactNode;
    if (tab.loading) {
        mark = <Spinner aria-hidden="true" color="current" size="sm" />;
    } else if (tab.faviconUrl && tab.faviconUrl !== failedUrl) {
        const url = tab.faviconUrl;
        mark = (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Image load failure is not a user interaction.
            <img
                alt=""
                draggable={false}
                height={markSize}
                onError={() => setFailedUrl(url)}
                referrerPolicy="no-referrer"
                src={url}
                width={markSize}
            />
        );
    } else {
        mark = <Icon aria-hidden="true" icon={Globe02Icon} size={markSize} />;
    }
    return <WorkspaceTabMark>{mark}</WorkspaceTabMark>;
}

function glyphIcon(glyph: Extract<TabMark, { kind: 'glyph' }>['glyph']) {
    switch (glyph) {
        case 'artifact':
            return File01Icon;
        case 'files':
            return Folder01Icon;
        case 'newTab':
            return Globe02Icon;
        default:
            return getSectionTabIcon(glyph);
    }
}
