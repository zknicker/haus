/**
 * The base of the key rule a new Project's key follows (specs/projects.md,
 * "Allocating a key", steps 1 and 2). Null when the name has no letter or digit:
 * the Server then takes the next free `P2`, `P3`, ... from the ledger. The
 * Server also appends the collision suffix, since only it sees the ledger.
 */
export function suggestProjectKey(name: string) {
    const characters = name.replaceAll(/[^A-Za-z0-9]/gu, '').toUpperCase();
    if (characters.length === 0) {
        return null;
    }
    const base = /^[0-9]/u.test(characters) ? `P${characters}` : characters;
    return base.padEnd(2, 'X').slice(0, 4);
}

/**
 * The `n`th candidate after a collision: the base with `n` appended, trimmed
 * from the end so the key stays within 5 characters.
 */
export function suffixProjectKey(base: string, n: number) {
    const suffix = String(n);
    return `${base.slice(0, 5 - suffix.length)}${suffix}`;
}
