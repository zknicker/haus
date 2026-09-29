/**
 * The one-line name for a shell call.
 *
 * A runtime types its own wrapper around whatever the model asked for — Codex
 * runs everything through `/bin/zsh -lc "…"` — and a heredoc opener drags the
 * whole document into the first line. Neither is what the Agent did, so the
 * row states the command itself and the body keeps the original verbatim.
 */

const labelMaxChars = 80;

const shellWrapper = /^(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)\s+(-[a-z]+)\s+([\s\S]+)$/u;
const heredocOpener = /\s*<<-?\s*(['"]?)[A-Za-z_][\w-]*\1\s*$/u;
const doubleQuoteEscape = /\\(["$\\`])/gu;

/**
 * Real `haus` commands, from the Agent CLI's own dispatcher
 * (`apps/computer/src/agent-cli.ts`). A Haus verb is product activity that
 * happens to be typed at a shell, so it reads as the verb.
 */
const hausVerbs: Record<string, string> = {
    'inbox check': 'Checked inbox with haus',
    'message check': 'Checked messages with haus',
    'message react': 'Reacted to a message with haus',
    'message read': 'Read messages with haus',
    'message resolve': 'Looked up a message with haus',
    'message search': 'Searched messages with haus',
    'message send': 'Sent a message with haus',
    'task claim': 'Claimed a task with haus',
    'task create': 'Created a task with haus',
    'task list': 'Listed tasks with haus',
    'task unclaim': 'Released a task with haus',
    'task update': 'Updated a task with haus',
    'thread unfollow': 'Unfollowed a thread with haus',
};

export function formatShellLabel(command: string): string {
    const summary = readShellCommandSummary(command);

    if (summary.length === 0) {
        return 'Ran a command';
    }

    return readHausVerb(summary) ?? `Ran ${clampLabel(summary)}`;
}

/** The command a person would recognize: unwrapped, first line, one space. */
export function readShellCommandSummary(command: string): string {
    const line = unwrapShellCommand(command)
        .split('\n')
        .map((entry) => entry.trim())
        .find((entry) => entry.length > 0);

    return (line ?? '').replace(heredocOpener, '').replace(/\s+/gu, ' ').trim();
}

export function unwrapShellCommand(command: string): string {
    const match = shellWrapper.exec(command.trim());
    const flags = match?.[1];
    const script = match?.[2];

    // `-l` and friends may precede it, but only `-c` means "the rest is the
    // script"; without it the argument is a file to run, not a command line.
    if (!(flags?.includes('c') && script)) {
        return command;
    }

    return readQuoted(script.trim());
}

function readQuoted(value: string): string {
    const quote = value.startsWith('"') ? '"' : value.startsWith("'") ? "'" : null;

    if (!quote) {
        return value;
    }

    const end = value.length > 1 && value.endsWith(quote) ? value.length - 1 : value.length;
    const inner = value.slice(1, end);

    return quote === '"' ? inner.replace(doubleQuoteEscape, '$1') : inner;
}

function readHausVerb(summary: string): string | null {
    if (!summary.startsWith('haus ')) {
        return null;
    }

    const words = summary.slice('haus '.length).split(' ');
    const group = words[0] ?? '';
    const subcommand = words[1]?.startsWith('-') ? '' : (words[1] ?? '');

    return hausVerbs[`${group} ${subcommand}`.trim()] ?? hausVerbs[group] ?? null;
}

function clampLabel(summary: string): string {
    return summary.length > labelMaxChars
        ? `${summary.slice(0, labelMaxChars - 1).trimEnd()}…`
        : summary;
}
