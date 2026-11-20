export function scrubCommandLine(command: string) {
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
    const scrubbed: string = words.filter((word) => word.length > 0).join(' ');
    return scrubbed;
}
export function scrubResultLine(line: string) {
    const unjoined = line
        .replace(/\s+:/gu, ':')
        .replace(/\s+=\s*|\s*=\s+/gu, '=')
        .replace(/\b([A-Z][A-Z0-9_]*)=\S*/gu, '$1=…')
        .replace(/(^|\s)([A-Za-z0-9_-]+):(?=\S)/gu, (match, lead: string, name: string) =>
            secretName.test(name) ? `${lead}${name}: ` : match
        );
    return scrubCommandLine(unjoined);
}
export function isSecretName(name: string) {
    return secretName.test(name);
}
export function scrubPhrase(text: string) {
    return text
        .split(/\s+/u)
        .map((word) => scrubWord(word.replace(/["'`]/gu, '')))
        .filter((word) => word.length > 0)
        .join(' ');
}
const secretName =
    /^(?:-u|--user|-{0,2}[A-Za-z0-9_-]*(?:api[-_]?key|token|secret|passw(?:or)?d|auth(?:orization)?|credential|cookie|session)[A-Za-z0-9_-]*)$/iu;

function scrubWord(word: string) {
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
function reduceUrl(url: string) {
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
function looksLikeToken(word: string) {
    return (
        /[A-Za-z0-9_\-+=/]{24,}/u.test(word) ||
        /^(?:sk|pk|rk)[-_]/u.test(word) ||
        /^(?:ghp|gho|ghs|ghu|github_pat)_/u.test(word) ||
        /^xox[abprs]-/u.test(word) ||
        /^(?:AKIA|AIza|eyJ)[A-Za-z0-9_-]{8,}/u.test(word)
    );
}
