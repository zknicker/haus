import type { DriveCitation } from '@haus/api';
import * as React from 'react';
import { driveCitationTarget, isDriveCitationHref } from './drive-citation-link.ts';
import {
    appOrigins,
    parseSharedArtifactLink,
    type SharedArtifactLinkTarget,
} from './shared-artifact-link.ts';

export interface SharedArtifactScope {
    origins: readonly string[];
    serverId: string;
    slug: string;
}

const SharedArtifactScopeContext = React.createContext<SharedArtifactScope | null>(null);
const noCitations: readonly DriveCitation[] = [];
const DriveCitationsContext = React.createContext(noCitations);

/**
 * Turns this Server's stable artifact links and the message's `drive://`
 * citations into in-app references. Outside a scope (previews, other
 * surfaces) links stay links.
 */
export function SharedArtifactScopeProvider({
    children,
    driveCitations = noCitations,
    origins,
    serverId,
    slug,
}: {
    children: React.ReactNode;
    /** The Drive files this message cites, as the Server bound them at send. */
    driveCitations?: readonly DriveCitation[];
    /** The App's own origins; defaults to the configured and current origin. */
    origins?: readonly string[];
    serverId: string;
    slug: string;
}) {
    const scope = React.useMemo(
        () => (serverId && slug ? { origins: origins ?? appOrigins(), serverId, slug } : null),
        [origins, serverId, slug]
    );
    return (
        <SharedArtifactScopeContext value={scope}>
            <DriveCitationsContext value={driveCitations}>{children}</DriveCitationsContext>
        </SharedArtifactScopeContext>
    );
}

export function useSharedArtifactScope() {
    return React.use(SharedArtifactScopeContext);
}

/** The library artifact `href` names on the open Server, or null for any other link. */
export function useSharedArtifactTarget(href: string | undefined): SharedArtifactLinkTarget | null {
    const scope = useSharedArtifactScope();
    const driveCitations = React.use(DriveCitationsContext);
    return React.useMemo(() => {
        if (!(scope && href)) {
            return null;
        }
        return isDriveCitationHref(href)
            ? driveCitationTarget(href, driveCitations)
            : parseSharedArtifactLink(href, scope);
    }, [driveCitations, href, scope]);
}
