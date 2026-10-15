/**
 * What may leave the Computer inside an uploaded execution journal. Unlike the
 * action-thought scrub (ADR 0036), the journal keeps full tool evidence, so this
 * removes credentials only: exact secret values the Computer knows, then
 * credential shapes and the values of secret-named keys, flags, and headers.
 */

const redacted = '[redacted]';
const minimumKnownSecretLength = 8;

const tokenShapes: readonly RegExp[] = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/gu,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/gu,
    /\b(?:sk|pk|rk)-(?:[A-Za-z0-9]{2,12}-)?[A-Za-z0-9_-]{16,}/gu,
    /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/gu,
    /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}/gu,
    /\bgithub_pat_[A-Za-z0-9_]{20,}/gu,
    /\bglpat-[A-Za-z0-9_-]{20,}/gu,
    /\bxox[abprs]-[A-Za-z0-9-]{10,}/gu,
    /\bxai-[A-Za-z0-9]{20,}/gu,
    /\bnpm_[A-Za-z0-9]{30,}/gu,
    /\bAKIA[0-9A-Z]{16}\b/gu,
    /\bAIza[0-9A-Za-z_-]{30,}/gu,
    /\b(?:grta|ops)_[A-Za-z0-9_-]{20,}/gu,
];

const schemePattern = /(\b(?:Bearer|Basic|Token)\s+)[A-Za-z0-9._~+/=-]{8,}/giu;
const userinfoPattern = /(\b[a-z][a-z0-9+.-]*:\/\/)[^\s/?#@"'<>]+@/giu;
const queryPattern = /([?&])([^=&#\s"'<>]+)=([^&#\s"'<>]*)/gu;
const quotedPairPattern =
    /(["'])([A-Za-z_][A-Za-z0-9_.-]*)\1(\s*:\s*)(["'])((?:\\.|(?!\4)[^\\])*)\4/gu;
const assignmentPattern = /\b([A-Za-z_][A-Za-z0-9_.-]*)(\s*=\s*)(["']?)([^\s"'&;|]+)\3/gu;
const flagPattern = /(^|\s)(--?[A-Za-z][A-Za-z0-9-]*)(\s+|=)(["']?)([^\s"']+)\4/gu;
const headerPattern = /\b([A-Za-z][A-Za-z0-9_-]*)(:[ \t]*)([^\s"',}]{8,})/gu;
const queryCredentialNames = new Set(['code', 'key', 'sig', 'signature', 'x-amz-signature']);

/** The Computer's credential and every secret-named environment value it runs with. */
export function computerKnownSecrets(
    credential: string,
    environment: Record<string, string | undefined>
): string[] {
    const values = Object.entries(environment).flatMap(([name, value]) =>
        value && isSecretKey(name) ? [value] : []
    );
    return [credential, ...values];
}

/** Masks credentials in one string, given the secret values this Computer holds. */
export function createJournalRedactor(knownValues: Iterable<string>): (text: string) => string {
    const values = [...new Set(knownValues)]
        .filter((value) => value.length >= minimumKnownSecretLength)
        .sort((left, right) => right.length - left.length);
    return (text) => {
        let result = text;
        for (const value of values) {
            if (result.includes(value)) {
                result = result.split(value).join(redacted);
            }
        }
        for (const shape of tokenShapes) {
            result = result.replace(shape, redacted);
        }
        return result
            .replace(schemePattern, `$1${redacted}`)
            .replace(userinfoPattern, `$1${redacted}@`)
            .replace(queryPattern, (match, lead: string, name: string, value: string) =>
                value && isCredentialQueryName(name) ? `${lead}${name}=${redacted}` : match
            )
            .replace(quotedPairPattern, (match, quote: string, name: string, colon, open) =>
                isSecretKey(name)
                    ? `${quote}${name}${quote}${colon}${open}${redacted}${open}`
                    : match
            )
            .replace(assignmentPattern, (match, name: string, equals: string, quote: string) =>
                isSecretKey(name) ? `${name}${equals}${quote}${redacted}${quote}` : match
            )
            .replace(
                flagPattern,
                (match, lead: string, flag: string, gap: string, quote: string, value: string) =>
                    isSecretFlag(flag, value)
                        ? `${lead}${flag}${gap}${quote}${redacted}${quote}`
                        : match
            )
            .replace(headerPattern, (match, name: string, colon: string) =>
                isSecretKey(name) ? `${name}${colon}${redacted}` : match
            );
    };
}

/**
 * Whether a key, variable, flag, or header names a credential: its last word is
 * token, secret, password, credential, cookie, authorization, or auth, or it is
 * an API, private, access, or signing key. `sessionId`, `author`, and
 * `max_tokens` are not.
 */
export function isSecretKey(name: string): boolean {
    const words = name
        .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
        .toLowerCase()
        .split(/[^a-z0-9]+/u)
        .filter((word) => word.length > 0);
    const last = words.at(-1) ?? '';
    const previous = words.at(-2) ?? '';
    return (
        secretWords.has(last) ||
        (last === 'key' && keyQualifiers.has(previous)) ||
        /(?:api|access|private|secret)key$/u.test(words.join(''))
    );
}

const secretWords = new Set([
    'apikey',
    'auth',
    'authorization',
    'cookie',
    'credential',
    'credentials',
    'passphrase',
    'passwd',
    'password',
    'pwd',
    'secret',
    'token',
]);
const keyQualifiers = new Set([
    'access',
    'account',
    'api',
    'client',
    'encryption',
    'master',
    'private',
    'secret',
    'service',
    'signing',
]);

/** `--token x`, or curl's `-u name:password` (never `git push -u origin`). */
function isSecretFlag(flag: string, value: string): boolean {
    const name = flag.replace(/^-+/u, '');
    return isSecretKey(name) || ((flag === '-u' || name === 'user') && value.includes(':'));
}

function isCredentialQueryName(name: string): boolean {
    return queryCredentialNames.has(name.toLowerCase()) || isSecretKey(name);
}
