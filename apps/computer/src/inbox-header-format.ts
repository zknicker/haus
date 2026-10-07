/**
 * The header facts every inbox line prints — the `msg=` short id and the
 * `time=` wall clock — shared by envelopes, notices, and thread context lines.
 */

/** A timestamp as the Agent's home-timezone wall clock, `YYYY-MM-DD HH:MM:SS`. */
export function formatInboxTime(timestamp: string, homeTimezone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hourCycle: 'h23',
        minute: '2-digit',
        month: '2-digit',
        second: '2-digit',
        timeZone: homeTimezone,
        year: 'numeric',
    }).formatToParts(new Date(timestamp));
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '';
    return `${value('year')}-${value('month')}-${value('day')} ${value('hour')}:${value('minute')}:${value('second')}`;
}

/**
 * An id that addresses no Chat message: a Trigger fire (`trf_…`), a Reminder
 * fire (`rmf_…`), or a Cloud Agent Run (`car_…`). None of them can be read,
 * threaded on, reacted to, or handed to `--message-id`. Each carries the id
 * that does work on its own envelope line instead — a fire's `fire=<id>` and
 * `--cause <fireId>`, a Run's `work=` and `run=`.
 */
function isBodilessInboxId(id: string): boolean {
    return /^(?:car|rmf|trf)_/u.test(id);
}

/**
 * The `msg=` short id every inbox surface prints, for messages and for the
 * bodiless items alike. A compound assignment key
 * (`task-assign:<messageId>:<version>`) shortens to the task message it hands
 * over, which is the id the Agent can actually address — reading it, threading
 * on it, or reacting to it. A fire has no such message, so it prints `-`
 * rather than an id the Agent would spend a failed command on.
 */
export function shortInboxId(id: string): string {
    if (isBodilessInboxId(id)) {
        return '-';
    }
    const assignment = /^task-assign:(?<messageId>[^:]+):/u.exec(id);
    const subject = assignment?.groups?.messageId ?? id;
    return subject.replace(/^[a-z]+_/u, '').slice(0, 8) || '-';
}

/**
 * Raft's `  │ ` continuation prefix (`indentAgentBodyContinuationLines`). Header
 * lines (`[target=…]`, thread-context `- [msg=…]`) always start at column 0,
 * so prefixing every continuation line of a sender handle, description, or
 * body keeps a newline in that free text from forging one. The `│` survives a
 * reader that trims each line. Every separator a universal-newline reader
 * breaks on counts, not just `\n`; `\r\n` matches as one.
 */
const bodyContinuationPrefix = '  │ ';
const bodyLineSeparator = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/gu;

export function indentContinuationLines(text: string): string {
    return text.replace(bodyLineSeparator, (separator) => `${separator}${bodyContinuationPrefix}`);
}

/**
 * A fire or task-assignment body is a Server-composed envelope whose own lines
 * (`fire=…`, the reply command) belong at column 0; the Server already indents
 * its untrusted parts (trigger payload, reminder description, script output),
 * and `haus message check` prints it verbatim too. Every Chat message body is
 * free text and takes the continuation prefix.
 */
export function inboxBodyText(id: string, content: string): string {
    return isBodilessInboxId(id) || id.startsWith('task-assign:')
        ? content
        : indentContinuationLines(content);
}
