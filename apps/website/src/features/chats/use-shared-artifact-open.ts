import type * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useOptionalDesktopTabs } from '../../hooks/desktop-tabs/desktop-tabs-context.ts';
import { opensPlaceAttribute } from '../../hooks/desktop-tabs/tab-open-gesture.ts';
import { artifactPath } from '../artifacts/artifact-format.ts';
import type { SharedArtifactLinkTarget } from './shared-artifact-link.ts';

/**
 * Anchor props that open a library artifact's page in the App: a router push,
 * which desktop places by the open gesture (ADR 0039). On the web a modified
 * click keeps the browser's own new-tab behavior; the href is a real App path.
 */
export function useSharedArtifactOpen(slug: string, target: SharedArtifactLinkTarget) {
    const navigate = useNavigate();
    const desktop = useOptionalDesktopTabs() !== null;
    const href = artifactPath(slug, target.artifactId, target.revisionId);
    return {
        [opensPlaceAttribute]: '',
        href,
        onClick: (event: React.MouseEvent<HTMLAnchorElement>) => {
            if (!desktop && isModifiedClick(event)) {
                return;
            }
            event.preventDefault();
            navigate(href);
        },
    };
}

function isModifiedClick(event: React.MouseEvent) {
    return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0;
}
