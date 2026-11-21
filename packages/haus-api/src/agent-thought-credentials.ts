/** What a masked credential reads as in a thought, an excerpt, or a journal record. */
export const thoughtRedactionMarker = '[redacted]';

/**
 * Masks credentials disclosed in prose, the shape a token scanner misses:
 * "The database password is hunter2", "api key: abc123", "the token for
 * staging was s3cr3t", "secret = xyz". A password, passphrase, passcode,
 * secret, token, credential, or key (bare or qualified, as in "API key" or
 * "ssh key"), optionally followed by a short "for …" phrase, then `is`, `are`,
 * `was`, `were`, `equals`, `reads`, `set to`, `:`, or `=`, has the value
 * that follows replaced with `[redacted]`. A plain word that describes the
 * credential rather than spelling it ("the password is correct", "the key is
 * to compare") is kept. The runner masks every thought with this before it
 * leaves, and the Server masks again before phrasing or falling back.
 */
export function maskCredentialDisclosures(text: string) {
    return text.replace(disclosurePattern, (match, lead: string, quote: string, value: string) =>
        describesCredential(value) ? match : `${lead}${quote}${thoughtRedactionMarker}${quote}`
    );
}

/** Whether a thought's text had a credential masked, by the runner or the Server. */
export function hasMaskedCredential(text: string) {
    return text.includes(thoughtRedactionMarker);
}

const secretNoun = String.raw`(?:pass(?:word|phrase|code|wd)s?|secrets?|tokens?|credentials?|(?:api|access|secret|private|license|ssh|signing|encryption|master)[\s_-]?keys?|apikeys?|keys?)`;

const qualifier = String.raw`(?:\s+(?:for|to|of|on|in)\s+[\w.-]+(?:\s+[\w.-]+)?)?`;

const separator = String.raw`\s*(?:[:=]|\b(?:is|are|was|were|equals|reads)\b|\bset\s+to\b)\s*`;

const disclosurePattern = new RegExp(
    String.raw`(\b${secretNoun}${qualifier}${separator})(["'\x60]?)([^\s"'\x60,;]+)\2`,
    'giu'
);

function describesCredential(value: string) {
    const word = value.toLowerCase().replace(/[.!?:)]+$/u, '');
    return (
        word.length === 0 || value.startsWith(thoughtRedactionMarker) || describingWords.has(word)
    );
}

const describingWords = new Set([
    'a',
    'absent',
    'also',
    'an',
    'being',
    'blank',
    'cached',
    'correct',
    'empty',
    'expired',
    'fine',
    'good',
    'here',
    'in',
    'incorrect',
    'invalid',
    'it',
    'missing',
    'needed',
    'no',
    'none',
    'not',
    'now',
    'null',
    'ok',
    'okay',
    'on',
    'optional',
    'present',
    'required',
    'right',
    'rotated',
    'saved',
    'set',
    'still',
    'stored',
    'that',
    'the',
    'there',
    'this',
    'to',
    'undefined',
    'unknown',
    'unset',
    'used',
    'valid',
    'whether',
    'wrong',
]);
