import * as React from 'react';
import { DesktopShellContext } from '../../features/shell/use-tab-navigator.ts';
import {
    type ArtifactPageTarget,
    artifactPagePath,
    filesPagePath,
    threadPagePath,
} from '../../routes/app/desktop-page-paths.ts';
import { useOptionalDesktopTabs } from './desktop-tabs-context.ts';
import { currentOpenGesture } from './tab-open-gesture.ts';
import { useTabPresence } from './tab-presence.ts';

export interface DesktopPageOpeners {
    openArtifact: (target: ArtifactPageTarget, title?: string) => void;
    openFiles: (chatId: string) => void;
    openThread: (chatId: string, anchorMessageId: string) => void;
}

/**
 * Desktop opens a Thread, a chat's Files, and an artifact as pages (ADR 0039).
 * From a page each opener is a link from its tab (the other pane in split);
 * from window chrome it goes to a place from the focused pane. A new-tab
 * gesture opens a new tab (`tab-open-gesture.ts`). Null on the
 * web, where the chat side pane hosts them.
 */
export function useDesktopPageOpeners(): DesktopPageOpeners | null {
    const tabs = useOptionalDesktopTabs();
    const slug = React.use(DesktopShellContext)?.server.slug;
    const { tabId } = useTabPresence();
    const openLink = tabs?.openLink;
    const openInFocusedPane = tabs?.openInFocusedPane;
    return React.useMemo<DesktopPageOpeners | null>(() => {
        if (!(openLink && openInFocusedPane && slug)) {
            return null;
        }
        const open = (path: string) => {
            const gesture = currentOpenGesture();
            if (tabId) {
                openLink(tabId, { kind: 'app', path }, gesture);
            } else {
                openInFocusedPane({ kind: 'app', path }, gesture === 'auto' ? 'current' : gesture);
            }
        };
        return {
            openArtifact: (target, title) => open(artifactPagePath(slug, target, title)),
            openFiles: (chatId) => open(filesPagePath(slug, chatId)),
            openThread: (chatId, anchorMessageId) =>
                open(threadPagePath(slug, chatId, anchorMessageId)),
        };
    }, [openInFocusedPane, openLink, slug, tabId]);
}
