import { artifactPathKey, type DriveCitation } from '@haus/api';
import type { SharedArtifactLinkTarget } from './shared-artifact-link.ts';

const scheme = 'drive://';

export function isDriveCitationHref(href: string) {
    return href.startsWith(scheme);
}

export function driveCitationTargets(citations: readonly DriveCitation[]) {
    const targets = new Map<string, SharedArtifactLinkTarget>();
    for (const { artifactId, path, revisionId } of citations) {
        if (artifactId && revisionId) {
            targets.set(artifactPathKey(path), { artifactId, revisionId });
        }
    }
    return targets;
}

export function hasResolvedDriveCitation(citations: readonly DriveCitation[]) {
    return citations.some((citation) => citation.artifactId && citation.revisionId);
}

export function driveCitationTarget(
    href: string,
    targets: ReadonlyMap<string, SharedArtifactLinkTarget>
) {
    if (!isDriveCitationHref(href)) {
        return null;
    }
    const path = decodePath(href.slice(scheme.length));
    return path === null ? null : (targets.get(artifactPathKey(path)) ?? null);
}

function decodePath(encoded: string) {
    try {
        return decodeURIComponent(encoded);
    } catch (cause) {
        if (cause instanceof URIError) {
            return null;
        }
        throw cause;
    }
}
