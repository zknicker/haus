import { appPlaces } from '../packages/agent-manual/src/app-places.ts';

const placeholder = /^\(.+\)$/u;
const arrow = ' → ';
/** Prose punctuation that ends one arrow chain inside a line. */
const boundary = /[,;:!?`]|\.(?:\s|$)|\s\(/u;
const uiWord = /\b(?:settings|profile|App)\b/iu;

const vocabulary = new Set(
    appPlaces.flatMap((place) => place.path.filter((segment) => !isPlaceholder(segment)))
);
const longestFirst = [...vocabulary].sort((left, right) => right.length - left.length);

export function isPlaceholder(segment: string): boolean {
    return placeholder.test(segment);
}

/** Every `A → B → …` chain in `text` that names App UI, as its segments. */
export function appPathChains(text: string): string[][] {
    return text
        .split('\n')
        .flatMap(lineChains)
        .filter((chain) =>
            chain.some((segment) => vocabulary.has(segment) || uiWord.test(segment))
        );
}

/** App path chains in `text` that are not a prefix of any `appPlaces` path. */
export function unmappedAppPaths(text: string): string[][] {
    return appPathChains(text).filter(
        (chain) =>
            !appPlaces.some((place) => chain.every((segment, i) => place.path[i] === segment))
    );
}

function lineChains(line: string): string[][] {
    const parts = line.split(arrow);
    const chains: string[][] = [];
    let chain = [chainStart(parts[0] ?? '')];
    for (const [index, part] of parts.slice(1).entries()) {
        const end = isPlaceholder(part.trim()) ? -1 : part.search(boundary);
        const last = index === parts.length - 2;
        if (end === -1 && !last) {
            chain.push(part.trim());
            continue;
        }
        chain.push(chainEnd(part, end === -1 ? part.length : end));
        chains.push(chain);
        chain = [chainStart(part)];
    }
    return chains;
}

/** The segment before an arrow: a known label ending the prose, else the last clause. */
function chainStart(text: string): string {
    const trimmed = text.trimEnd();
    const known = longestFirst.find(
        (segment) =>
            trimmed.endsWith(segment) && /(?:^|\s)$/u.test(trimmed.slice(0, -segment.length))
    );
    if (known) {
        return known;
    }
    const clauses = trimmed.split(/[,;:!?`(]|\.\s/u);
    return (clauses.at(-1) ?? '').trim();
}

/** The segment after the last arrow: a known label opening the prose, else up to punctuation. */
function chainEnd(text: string, end: number): string {
    const trimmed = text.trimStart();
    const known = longestFirst.find(
        (segment) => trimmed.startsWith(segment) && !/^\w/u.test(trimmed.slice(segment.length))
    );
    return known ?? text.slice(0, end).trim();
}
