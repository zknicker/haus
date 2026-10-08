// House-voice checks over one Agent-authored message body. The rules mirror
// only what the composed prompt teaches: the house personality ("no closing
// offers ... and no em dashes", "not a service answering customers") and the
// formatting rule ("Don't bold for emphasis or as labels"). Thresholds are
// deliberately conservative: a false positive fails a live run, a miss does not.

/**
 * @typedef {'bold-label-wall' | 'closing-offer' | 'em-dash' | 'service-opener'} VoiceRule
 * @typedef {{ excerpt: string, rule: VoiceRule }} VoiceViolation
 */

/** Line-opening `**Label:**` / `**Label**:` runs at or above this count, with no list or table. */
export const boldLabelWallThreshold = 3;

const closingOfferPatterns = [
    // Offer form only: "let me know if/whether X or Y" is a real question to the human.
    /\blet me know if (?:you(?:'d| would)? (?:need|want|like) (?:anything|more|me to)|there'?s anything|(?:this|that) (?:works|helps))\b/i,
    /\bfeel free to\b/i,
    /\bhappy to help\b/i,
    /\bhope (?:this|that) helps\b/i,
    /\banything else (?:i can|you(?:'d| would)? (?:like|need|want))\b/i,
];

const serviceOpenerPattern =
    /^(?:great question|good question|excellent question|absolutely!|certainly!)/i;

const boldLabelPattern = /^\*\*[^*\n]{1,40}?(?::\*\*|\*\*\s*:)/;
const listItemPattern = /^\s*(?:[-*+]|\d+[.)])\s+/;
const tableRowPattern = /^\s*\|.*\|\s*$/;
const emDash = '—';
const quoteContextChars = 6;

/**
 * Returns every house-voice violation in `content`. `quotedSources` are texts
 * the scenario itself wrote (human sends, seeded Agent messages): an em dash
 * the Agent copied from one of them is a quote, not its own prose.
 *
 * @param {string} content
 * @param {{ quotedSources?: readonly string[] }} [options]
 * @returns {VoiceViolation[]}
 */
export function checkAgentVoice(content, { quotedSources = [] } = {}) {
    const lines = proseLines(content);
    const sources = quotedSources.map(stripInlineCode);
    return [
        ...emDashViolations(lines, sources),
        ...(endsInProse(content) ? closingOfferViolations(lines) : []),
        ...serviceOpenerViolations(lines),
        ...boldLabelViolations(lines),
    ];
}

/** Human-readable one-liner for a violation, used in assertion labels. */
export function describeViolation({ excerpt, rule }) {
    return `${rule}: ${JSON.stringify(excerpt)}`;
}

function emDashViolations(lines, quotedSources) {
    const violations = [];
    for (const line of lines) {
        if (isTableRow(line)) {
            // A bare "—" cell is a table's empty value, not prose.
            const cells = line.split('|').filter((cell) => cell.trim() !== emDash);
            if (!cells.some((cell) => hasOwnEmDash(cell, quotedSources))) {
                continue;
            }
        } else if (!hasOwnEmDash(line, quotedSources)) {
            continue;
        }
        violations.push({ excerpt: excerptAround(line, line.indexOf(emDash)), rule: 'em-dash' });
    }
    return violations;
}

function hasOwnEmDash(text, quotedSources) {
    let index = text.indexOf(emDash);
    while (index !== -1) {
        if (!isQuoted(text, index, quotedSources)) {
            return true;
        }
        index = text.indexOf(emDash, index + 1);
    }
    return false;
}

/** Quoted when some source carries this em dash with the same text on both sides. */
function isQuoted(text, index, quotedSources) {
    const needLeft = Math.min(quoteContextChars, index);
    const needRight = Math.min(quoteContextChars, text.length - index - 1);
    return quotedSources.some((source) => {
        let at = source.indexOf(emDash);
        while (at !== -1) {
            if (
                // A source boundary counts as matched context: the quote may start or end there.
                sharedRun(text, index, source, at, -1) >= Math.min(needLeft, at) &&
                sharedRun(text, index, source, at, 1) >= Math.min(needRight, source.length - at - 1)
            ) {
                return true;
            }
            at = source.indexOf(emDash, at + 1);
        }
        return false;
    });
}

function sharedRun(text, textIndex, source, sourceIndex, step) {
    let length = 0;
    for (;;) {
        const offset = (length + 1) * step;
        const left = text[textIndex + offset];
        if (left === undefined || left !== source[sourceIndex + offset]) {
            return length;
        }
        length += 1;
    }
}

function closingOfferViolations(lines) {
    const last = lines.findLast((line) => line.trim().length > 0)?.trim();
    if (!last) {
        return [];
    }
    const sentence = lastSentence(last);
    return closingOfferPatterns.some((pattern) => pattern.test(sentence))
        ? [{ excerpt: sentence, rule: 'closing-offer' }]
        : [];
}

function serviceOpenerViolations(lines) {
    const first = lines.find((line) => line.trim().length > 0)?.trim() ?? '';
    const opener = first.replace(/^[^\p{L}]+/u, '');
    return serviceOpenerPattern.test(opener)
        ? [{ excerpt: first.slice(0, 60), rule: 'service-opener' }]
        : [];
}

function boldLabelViolations(lines) {
    if (lines.some((line) => listItemPattern.test(line) || isTableRow(line))) {
        return [];
    }
    const labels = lines.map((line) => line.trim()).filter((line) => boldLabelPattern.test(line));
    return labels.length >= boldLabelWallThreshold
        ? [
              {
                  excerpt: labels.map((line) => line.slice(0, 30)).join(' / '),
                  rule: 'bold-label-wall',
              },
          ]
        : [];
}

/** Message lines with fenced code, inline code, and blockquotes removed. */
function proseLines(content) {
    const lines = [];
    let fenced = false;
    for (const line of content.split('\n')) {
        if (/^\s*(?:```|~~~)/.test(line)) {
            fenced = !fenced;
            continue;
        }
        if (fenced || /^\s*>/.test(line)) {
            continue;
        }
        lines.push(stripInlineCode(line));
    }
    return lines;
}

/** False when the message closes on a code fence or blockquote, so its last prose line is a lead-in. */
function endsInProse(content) {
    const last = content.trimEnd().split('\n').at(-1) ?? '';
    return !/^\s*(?:```|~~~|>)/.test(last);
}

function stripInlineCode(text) {
    return text.replace(/`[^`\n]*`/g, '');
}

function isTableRow(line) {
    return tableRowPattern.test(line);
}

function lastSentence(line) {
    const sentences = line.split(/(?<=[.!?])\s+/).filter((sentence) => sentence.length > 0);
    return sentences.at(-1) ?? line;
}

function excerptAround(text, index) {
    return text.slice(Math.max(0, index - 30), index + 30).trim();
}
