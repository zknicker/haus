import * as React from 'react';
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

/**
 * Turns this Server's stable artifact links inside a message into in-app
 * references. Outside a scope (previews, other surfaces) links stay links.
 */
export function SharedArtifactScopeProvider({
    children,
    origins,
    serverId,
    slug,
}: {
    children: React.ReactNode;
    /** The App's own origins; defaults to the configured and current origin. */
    origins?: readonly string[];
    serverId: string;
    slug: string;
}) {
    const scope = React.useMemo(
        () => (serverId && slug ? { origins: origins ?? appOrigins(), serverId, slug } : null),
        [origins, serverId, slug]
    );
    return <SharedArtifactScopeContext value={scope}>{children}</SharedArtifactScopeContext>;
}

export function useSharedArtifactScope() {
    return React.use(SharedArtifactScopeContext);
}

/** The library artifact `href` names on the open Server, or null for any other link. */
export function useSharedArtifactTarget(href: string | undefined): SharedArtifactLinkTarget | null {
    const scope = useSharedArtifactScope();
    return React.useMemo(
        () => (scope && href ? parseSharedArtifactLink(href, scope) : null),
        [href, scope]
    );
}
