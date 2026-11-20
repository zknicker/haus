import { artifactPathKey, type DriveCitation } from '@haus/api';

const scheme = 'drive://';

export function isDriveCitationHref(href: string) {
    return href.startsWith(scheme);
}

export function driveCitationTarget(href: string, citations: readonly DriveCitation[]) {
    if (!isDriveCitationHref(href)) {
        return null;
    }
    const path = decodePath(href.slice(scheme.length));
    if (path === null) {
        return null;
    }
    const key = artifactPathKey(path);
    const citation = citations.find((item) => artifactPathKey(item.path) === key);
    return citation?.artifactId && citation.revisionId
        ? { artifactId: citation.artifactId, revisionId: citation.revisionId }
        : null;
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
