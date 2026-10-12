/** Wildcards: * stays in a path segment, ** crosses /, ? matches one character. */
export function matchesPattern(pattern: string, value: string): boolean {
    if (value.length > 1024) {
        return false;
    }
    const characters = Array.from(value);
    const tokens = pattern.match(/\*\*|[\s\S]/gu) ?? [];
    let previous = Array.from({ length: characters.length + 1 }, (_, index) => index === 0);
    for (const token of tokens) {
        const wildcard = token === '*' || token === '**';
        const next = new Array<boolean>(characters.length + 1).fill(false);
        next[0] = wildcard && previous[0] === true;
        for (let index = 1; index <= characters.length; index++) {
            const character = characters[index - 1];
            next[index] = wildcard
                ? previous[index] === true ||
                  (next[index - 1] === true && (token === '**' || character !== '/'))
                : previous[index - 1] === true &&
                  (token === '?' ? character !== '/' : token === character);
        }
        previous = next;
    }
    return previous[characters.length] === true;
}

export function matchesSelection(
    included: readonly string[] | undefined,
    excluded: readonly string[] | undefined,
    value: string | null,
    defaultBranch?: string | null
): boolean {
    const matches = (pattern: string) => {
        if (value === null) {
            return false;
        }
        if (pattern === '@default' && defaultBranch !== undefined) {
            return defaultBranch !== null && value === defaultBranch;
        }
        return matchesPattern(pattern, value);
    };
    return (included === undefined || included.some(matches)) && !excluded?.some(matches);
}
