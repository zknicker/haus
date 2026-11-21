/**
 * Scrubbing for action thoughts (ADR 0036): what may leave the Computer to
 * describe a command or tool call. URLs keep only their host and word-like
 * path segments; emails, credentials, token-like strings, and the values of
 * secret-named flags, headers, and variables are removed; absolute paths keep
 * their basename. Quotes go, so the result reads as plain words.
 */
export function scrubCommandLine(command: string): string {
    const words: string[] = [];
    let redactNext = false;
    for (const raw of command.split(/\s+/u)) {
        const word = raw.replace(/["'`]/gu, '');
        if (word.length === 0) {
            continue;
        }
        if (redactNext) {
            if (/^(?:bearer|basic|token)$/iu.test(word)) {
                words.push(word);
                continue;
            }
            redactNext = false;
            words.push('…');
            continue;
        }
        const assignment = /^([^=]+)=(.*)$/u.exec(word);
        if (assignment?.[1] && secretName.test(assignment[1])) {
            // `TOKEN=abc` → `TOKEN=…`; a bare `--token=` takes the next word as its value.
            words.push(assignment[2] ? `${assignment[1]}=…` : word);
            redactNext = !assignment[2];
            continue;
        }
        if (!assignment && secretName.test(word.replace(/:$/u, ''))) {
            words.push(word);
            redactNext = true;
            continue;
        }
        words.push(scrubWord(word));
    }
    return words.filter((word) => word.length > 0).join(' ');
}

/**
 * One line of a tool's output, scrubbed at least as hard as a command line:
 * everything `scrubCommandLine` removes, plus the value of any
 * environment-style assignment (`HOME=…`, `DATABASE_URL=…`) and of a
 * secret-named key joined to its value (`api_key:abc`, `"token":"abc"`,
 * `password = abc`).
 */
export function scrubResultLine(line: string): string {
    const unjoined = line
        .replace(/\s+:/gu, ':')
        // `password = hunter2` (TOML, INI, source) joins so its value reads as an assignment.
        .replace(/\s+=\s*|\s*=\s+/gu, '=')
        .replace(/\b([A-Z][A-Z0-9_]*)=\S*/gu, '$1=…')
        .replace(/(^|\s)([A-Za-z0-9_-]+):(?=\S)/gu, (match, lead: string, name: string) =>
            secretName.test(name) ? `${lead}${name}: ` : match
        );
    return scrubCommandLine(unjoined);
}

/** Whether a flag, header, variable, or argument name carries a credential value. */
export function isSecretName(name: string): boolean {
    return secretName.test(name);
}

/** A free-text argument (a query, a pattern, a file name) with the same removals. */
export function scrubPhrase(text: string): string {
    return text
        .split(/\s+/u)
        .map((word) => scrubWord(word.replace(/["'`]/gu, '')))
        .filter((word) => word.length > 0)
        .join(' ');
}

/**
 * A flag, header, or variable whose value is a credential: `--token`,
 * `--api-key`, `-u`, `Authorization:`, `X-Api-Key`, `GITHUB_TOKEN=…`,
 * `password=…`.
 */
const secretName =
    /^(?:-u|--user|-{0,2}[A-Za-z0-9_-]*(?:api[-_]?key|token|secret|passw(?:or)?d|auth(?:orization)?|credential|cookie|session)[A-Za-z0-9_-]*)$/iu;

function scrubWord(word: string): string {
    if (/[a-z][a-z0-9+.-]*:\/\//iu.test(word)) {
        return word.replace(/[a-z][a-z0-9+.-]*:\/\/\S+/giu, (url) => reduceUrl(url));
    }
    if (/[^\s@]+@[^\s@]+\.[A-Za-z]{2,}/u.test(word)) {
        return word.replace(/[^\s@(<]+@[^\s@)>]+\.[A-Za-z]{2,}/gu, '').replace(/^\W+$/u, '');
    }
    const name = /^~?\/\S*\//u.test(word)
        ? (word.replace(/\/+$/u, '').split('/').pop() ?? '')
        : word;
    return looksLikeToken(name) ? '…' : name;
}

/** `https://user:pw@api.weather.gov/gridpoints/OKX/33,42/forecast?x=1` → `api.weather.gov/gridpoints/OKX/forecast`. */
function reduceUrl(url: string): string {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return '';
    }
    const words = parsed.pathname
        .split('/')
        .filter((segment) => /^[A-Za-z][A-Za-z0-9._-]{0,40}$/u.test(segment))
        .filter((segment) => !looksLikeToken(segment));
    return [parsed.hostname, ...words].join('/');
}

/** Long opaque runs and well-known credential prefixes. */
function looksLikeToken(word: string): boolean {
    return (
        /[A-Za-z0-9_\-+=/]{24,}/u.test(word) ||
        /^(?:sk|pk|rk)[-_]/u.test(word) ||
        /^(?:ghp|gho|ghs|ghu|github_pat)_/u.test(word) ||
        /^xox[abprs]-/u.test(word) ||
        /^(?:AKIA|AIza|eyJ)[A-Za-z0-9_-]{8,}/u.test(word)
    );
}
