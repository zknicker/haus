import { artifactPathKey, parseArtifactPath, readMarkdownSpans } from '@haus/api';

const scheme = 'drive://';
const maxCitations = 100;

export function readDriveCitationPaths(content: string) {
    const paths = new Map<string, string>();
    for (const { url } of readMarkdownSpans(content).links) {
        if (!url.startsWith(scheme)) {
            continue;
        }
        const path = parseCitedPath(url.slice(scheme.length));
        if (path && !paths.has(artifactPathKey(path))) {
            paths.set(artifactPathKey(path), path);
        }
        if (paths.size >= maxCitations) {
            break;
        }
    }
    return [...paths.values()];
}

function parseCitedPath(encoded: string) {
    let decoded: string;
    try {
        decoded = decodeURIComponent(encoded);
    } catch (cause) {
        if (cause instanceof URIError) {
            return null;
        }
        throw cause;
    }
    const parsed = parseArtifactPath(decoded);
    return parsed.ok ? parsed.path : null;
}
