/**
 * Reads a `haus` Agent CLI call as the product action it is. The command
 * names come from the CLI's own dispatcher (`apps/computer/src/agent-cli.ts`);
 * targets follow its `#channel` / `dm:@peer` grammar, where a trailing
 * `:<shortId>` addresses a message thread. A display heuristic, not a shell
 * parser: anything it cannot read degrades to the generic verb.
 */
export interface HausMessage {
    /** The message text the Agent wrote (heredoc or here-string), or null when sent from a draft. */
    readonly body: string | null;
    readonly isReply: boolean;
    readonly isThread: boolean;
    /** Where it went, as a person reads it: `DM` or `#general`; null without a target. */
    readonly place: string | null;
}

/** [past, present] for each Agent CLI command with a verb of its own. */
const hausVerbs: Record<string, readonly [string, string]> = {
    'attachment upload': ['Uploaded a file', 'Uploading a file'],
    'inbox check': ['Checked inbox', 'Checking inbox'],
    'message check': ['Checked messages', 'Checking messages'],
    'message follow': ['Followed a thread', 'Following a thread'],
    'message react': ['Reacted', 'Reacting'],
    'message read': ['Read messages', 'Reading messages'],
    'message resolve': ['Looked up a message', 'Looking up a message'],
    'message search': ['Searched messages', 'Searching messages'],
    'message send': ['Sent a message', 'Sending a message'],
    'message unfollow': ['Unfollowed a thread', 'Unfollowing a thread'],
    'reminder cancel': ['Cancelled a reminder', 'Cancelling a reminder'],
    'reminder list': ['Listed reminders', 'Listing reminders'],
    'reminder schedule': ['Set a reminder', 'Setting a reminder'],
    'reminder snooze': ['Snoozed a reminder', 'Snoozing a reminder'],
    'reminder update': ['Updated a reminder', 'Updating a reminder'],
    'task assign': ['Assigned a task', 'Assigning a task'],
    'task claim': ['Claimed a task', 'Claiming a task'],
    'task create': ['Created a task', 'Creating a task'],
    'task list': ['Listed tasks', 'Listing tasks'],
    'task unassign': ['Unassigned a task', 'Unassigning a task'],
    'task unclaim': ['Released a task', 'Releasing a task'],
    'task update': ['Updated a task', 'Updating a task'],
    'thread unfollow': ['Unfollowed a thread', 'Unfollowing a thread'],
};

/** Flags that take a value; every other `--flag` is a switch. */
const valueFlags = new Set(['--attachment-id', '--cause', '--reply-to', '--target']);

/** The [past, present] verb for one `haus …` command line, or null when it has none. */
export function readHausVerb(text: string): readonly [string, string] | null {
    const words = tokenize(text);
    const group = words[1] ?? '';
    const subcommand = words[2]?.startsWith('-') ? '' : (words[2] ?? '');
    if (group === 'message' && subcommand === 'send') {
        return formatSendVerb(readFlags(words.slice(3)));
    }
    return hausVerbs[`${group} ${subcommand}`.trim()] ?? hausVerbs[group] ?? null;
}

/** The first `haus message send` in an unwrapped shell script, with the text it sent. */
export function readHausMessage(script: string): HausMessage | null {
    const lines = script.split('\n');
    for (const [index, line] of lines.entries()) {
        const words = tokenize(line);
        const start = words.findIndex(
            (word, at) =>
                programOf(word) === 'haus' &&
                words[at + 1] === 'message' &&
                words[at + 2] === 'send'
        );
        if (start === -1) {
            continue;
        }
        const flags = readFlags(words.slice(start + 3));
        const target = flags.values.get('--target') ?? null;
        const place = target ? readTargetPlace(target) : null;
        return {
            body: readHeredocBody(line, lines.slice(index + 1)) ?? readHereString(line),
            isReply: flags.values.has('--reply-to'),
            isThread: place?.isThread ?? false,
            place: place?.name ?? null,
        };
    }
    return null;
}

function formatSendVerb(flags: Flags): readonly [string, string] {
    const target = flags.values.get('--target');
    const place = target ? readTargetPlace(target) : null;
    if (!place) {
        return ['Sent a message', 'Sending a message'];
    }
    if (place.isThread) {
        return ['Replied in thread', 'Replying in thread'];
    }
    if (flags.values.has('--reply-to')) {
        return [`Replied in ${place.name}`, `Replying in ${place.name}`];
    }
    return [`Sent a message to ${place.name}`, `Sending a message to ${place.name}`];
}

/** A DM reads as `DM`, never the peer's name. */
function readTargetPlace(target: string): { isThread: boolean; name: string } {
    const dm = /^dm:@[^:]+(:.+)?$/u.exec(target);
    if (dm) {
        return { isThread: Boolean(dm[1]), name: 'DM' };
    }
    const channel = /^(#[^:]+)(:.+)?$/u.exec(target);
    if (channel?.[1]) {
        return { isThread: Boolean(channel[2]), name: channel[1] };
    }
    return { isThread: false, name: target };
}

interface Flags {
    readonly values: ReadonlyMap<string, string>;
}

function readFlags(words: readonly string[]): Flags {
    const values = new Map<string, string>();
    for (let index = 0; index < words.length; index += 1) {
        const word = words[index] ?? '';
        if (isOperator(word)) {
            break;
        }
        if (!word.startsWith('--')) {
            continue;
        }
        const equals = word.indexOf('=');
        if (equals > 0) {
            values.set(word.slice(0, equals), word.slice(equals + 1));
        } else if (valueFlags.has(word) && words[index + 1] !== undefined) {
            values.set(word, words[index + 1] ?? '');
            index += 1;
        } else {
            values.set(word, '');
        }
    }
    return { values };
}

const heredocOpener = /(?<!<)<<(-?)\s*(['"]?)([A-Za-z_][\w-]*)\2/u;
const hereString = /<<<\s*('([^']*)'|"((?:\\.|[^"\\])*)"|(\S+))/u;

/** The document a `<<EOF` / `<<'EOF'` / `<<-EOF` opener on this line feeds the command. */
function readHeredocBody(line: string, rest: readonly string[]): string | null {
    const match = heredocOpener.exec(line);
    const delimiter = match?.[3];
    if (!delimiter) {
        return null;
    }
    const stripTabs = match[1] === '-';
    const body: string[] = [];
    for (const raw of rest) {
        const next = stripTabs ? raw.replace(/^\t+/u, '') : raw;
        if (next.trim() === delimiter) {
            break;
        }
        body.push(next);
    }
    return body.join('\n');
}

function readHereString(line: string): string | null {
    const match = hereString.exec(line);
    if (!match) {
        return null;
    }
    return match[2] ?? match[3]?.replace(/\\(["$\\`])/gu, '$1') ?? match[4] ?? null;
}

const operatorChars = new Set([';', '|', '&', '<', '>']);

function isOperator(word: string): boolean {
    return word.length > 0 && operatorChars.has(word[0] ?? '');
}

function programOf(word: string): string {
    return word.split('/').at(-1) ?? word;
}

/**
 * Shell words with quotes removed. An unquoted `;`, `|`, `&`, `<`, or `>` run
 * becomes its own word, so callers can stop at the first operator.
 */
function tokenize(line: string): string[] {
    const words: string[] = [];
    let current = '';
    let hasWord = false;
    let index = 0;
    const flush = () => {
        if (hasWord) {
            words.push(current);
        }
        current = '';
        hasWord = false;
    };

    while (index < line.length) {
        const char = line[index] ?? '';
        if (char === '"' || char === "'") {
            const quoted = readQuotedWord(line, index);
            current += quoted.text;
            hasWord = true;
            index = quoted.end;
        } else if (char === '\\' && index + 1 < line.length) {
            current += line[index + 1];
            hasWord = true;
            index += 2;
        } else if (/\s/u.test(char)) {
            flush();
            index += 1;
        } else if (operatorChars.has(char)) {
            flush();
            let end = index + 1;
            while (operatorChars.has(line[end] ?? '')) {
                end += 1;
            }
            words.push(line.slice(index, end));
            index = end;
        } else {
            current += char;
            hasWord = true;
            index += 1;
        }
    }
    flush();
    return words;
}

/** A quoted run starting at `start`, unquoted; `"…"` honours backslash escapes. */
function readQuotedWord(line: string, start: number): { end: number; text: string } {
    const quote = line[start];
    let text = '';
    let index = start + 1;
    while (index < line.length && line[index] !== quote) {
        if (quote === '"' && line[index] === '\\' && index + 1 < line.length) {
            index += 1;
        }
        text += line[index];
        index += 1;
    }
    return { end: index + 1, text };
}
