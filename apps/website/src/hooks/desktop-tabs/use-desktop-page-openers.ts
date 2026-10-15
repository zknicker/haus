import * as React from 'react';
import { DesktopShellContext } from '../../features/shell/use-tab-navigator.ts';
import {
    type ArtifactPageTarget,
    artifactPagePath,
    filesPagePath,
    threadPagePath,
} from '../../routes/app/desktop-page-paths.ts';
import { useOptionalDesktopTabs } from './desktop-tabs-context.ts';
import { openWithGesture } from './tab-navigation.ts';
import { currentOpenGesture, type OpenGesture } from './tab-open-gesture.ts';
import { useTabId } from './tab-presence.ts';

export interface DesktopPageOpeners {
    openArtifact: (target: ArtifactPageTarget, title?: string) => void;
    openFiles: (chatId: string) => void;
    /**
     * Any in-Server page by path. `gesture` defaults to the in-flight click's; a handler
     * that navigates after an `await` reads `currentOpenGesture()` first and passes it.
     */
    openPage: (path: string, gesture?: OpenGesture) => void;
    openThread: (chatId: string, anchorMessageId: string, gesture?: OpenGesture) => void;
}

/**
 * Desktop's Open verb for code that opens a page without a router push: a Thread, a chat's
 * Attachments, an artifact, or any path (ADR 0039). A plain open lands in the right pane (from its
 * tab, or with no source from window chrome: a sidebar row's menu); a modified click opens a
 * tab beside the source (`openWithGesture`). Null on the web, where the chat side pane hosts
 * Threads, Attachments, and artifacts.
 */
export function useDesktopPageOpeners(): DesktopPageOpeners | null {
    const tabs = useOptionalDesktopTabs();
    const slug = React.use(DesktopShellContext)?.server.slug;
    const tabId = useTabId();
    return React.useMemo<DesktopPageOpeners | null>(() => {
        if (!(tabs && slug)) {
            return null;
        }
        const openPage = (path: string, gesture = currentOpenGesture()) =>
            openWithGesture(tabs, tabId ?? null, { kind: 'app', path }, gesture);
        return {
            openArtifact: (target, title) => openPage(artifactPagePath(slug, target, title)),
            openFiles: (chatId) => openPage(filesPagePath(slug, chatId)),
            openPage,
            openThread: (chatId, anchorMessageId, gesture) =>
                openPage(threadPagePath(slug, chatId, anchorMessageId), gesture),
        };
    }, [slug, tabId, tabs]);
}
