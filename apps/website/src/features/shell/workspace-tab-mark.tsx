import { Spinner } from '@heroui/react';
import { File01Icon, Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { ChannelIconBox } from '../../components/chats/channel-icon-box.tsx';
import { EntityAvatar } from '../../components/ui/entity-avatar.tsx';
import { Icon } from '../../components/ui/icon.tsx';
import type { BrowserTab } from '../../lib/desktop-browser.ts';
import type { PrimaryTabIdentity } from './primary-tab-identity.ts';
import { getSectionTabIcon } from './route-tab-presentation.tsx';
import { WorkspaceTabMark } from './workspace-tab.tsx';

/** Glyphs and favicons are 16px, centered in the tab's 20px mark slot. */
const markSize = 16;
/** Identity marks — a channel box or an avatar — fill the 20px slot: a boxed mark needs the extra size to read level with a bare favicon. */
const identityMarkSize = 20;

/** The primary tab's mark, and a Thread tab's chat mark: the same identity the sidebar row shows. */
export function PrimaryTabMark({ identity }: { identity: PrimaryTabIdentity }) {
    return <WorkspaceTabMark>{renderIdentity(identity)}</WorkspaceTabMark>;
}

/** An empty mark slot, so a loading tab's title keeps its inset. */
export function WorkspaceTabMarkSlot() {
    return <WorkspaceTabMark>{null}</WorkspaceTabMark>;
}

/**
 * A browser tab's mark: a spinner while the page loads, then the page's own
 * favicon, falling back to a globe when the page has none or it fails to load.
 */
export function BrowserTabMark({ tab }: { tab: Pick<BrowserTab, 'faviconUrl' | 'loading'> }) {
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

/** An artifact tab's mark: the same file glyph the Artifact Panel's tabs use. */
export function ArtifactTabMark() {
    return (
        <WorkspaceTabMark>
            <Icon aria-hidden="true" icon={File01Icon} size={markSize} />
        </WorkspaceTabMark>
    );
}

/**
 * An Agent tab's mark: the Agent's avatar, the same identity mark a DM tab
 * shows; an empty slot while the Agent loads.
 */
export function AgentTabMark({
    agent,
}: {
    agent: { avatarUrl: string | null; name: string } | null;
}) {
    return (
        <WorkspaceTabMark>
            {agent ? (
                <EntityAvatar name={agent.name} size={identityMarkSize} src={agent.avatarUrl} />
            ) : null}
        </WorkspaceTabMark>
    );
}

function renderIdentity(identity: PrimaryTabIdentity) {
    switch (identity.kind) {
        case 'channel':
            return <ChannelIconBox color={identity.color} icon={identity.icon} size="tab" />;
        case 'dm':
            return (
                <EntityAvatar
                    name={identity.label}
                    size={identityMarkSize}
                    src={identity.avatarUrl}
                />
            );
        case 'section':
            return (
                <Icon
                    aria-hidden="true"
                    icon={getSectionTabIcon(identity.section)}
                    size={markSize}
                />
            );
    }
}
