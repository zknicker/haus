import { artifactPathKey, parseArtifactPath } from '@haus/api';
import { isProtectedRange, readCodeRanges } from '../chats/bare-reference-tokens.ts';

const linkPattern = /\[[^\]\n]+\]\(([^)\n]+)\)/gu;
const scheme = 'drive://';
const maxCitations = 100;

export function readDriveCitationPaths(content: string) {
    const code = readCodeRanges(content);
    const paths = new Map<string, string>();
    for (const match of content.matchAll(linkPattern)) {
        const target = match[1]?.trim() ?? '';
        if (
            !target.startsWith(scheme) ||
            isProtectedRange(code, match.index, match.index + match[0].length)
        ) {
            continue;
        }
        const path = parseCitedPath(target.slice(scheme.length));
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
