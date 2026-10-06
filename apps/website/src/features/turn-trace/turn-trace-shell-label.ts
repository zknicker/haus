import { basenameOf } from './turn-trace-path.ts';
import { parseShellScript, type ShellCommand } from './turn-trace-shell-script.ts';
import type { TraceTense } from './turn-trace-tense.ts';

/**
 * The one-line name for a shell call.
 *
 * A runtime types its own wrapper around whatever the model asked for — Codex
 * runs everything through `/bin/zsh -lc "…"` — and a heredoc drags a whole
 * document in. Neither is what the Agent did. A one-line command reads as typed;
 * a compound or multi-line script reads as its most meaningful command, with
 * `cd`/`export`/`echo` setup and `haus` bookkeeping skipped, so a script that
 * claimed a task, wrote seven files, and ran the tests never reads as
 * "Claimed a task". The Command body still shows the original verbatim.
 */
export interface ShellLabel {
    /** Other meaningful commands the label does not name: the row's `+N commands`. */
    readonly extraCommands: number;
    /** Every command is a `haus` CLI call: Agent bookkeeping, not work. */
    readonly isHausOnly: boolean;
    /** Logical script lines outside heredoc bodies. */
    readonly lines: number;
    readonly past: string;
    readonly present: string;
}

const labelMaxChars = 80;

const shellWrapper = /^(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)\s+(-[a-z]+)\s+([\s\S]+)$/u;
const doubleQuoteEscape = /\\(["$\\`])/gu;

/** Setup that never names a row. */
const noisePrograms = new Set([
    '.',
    ':',
    'cd',
    'echo',
    'exit',
    'export',
    'false',
    'popd',
    'printf',
    'pushd',
    'set',
    'source',
    'true',
    'unset',
]);
const minorPrograms = new Set(['chmod', 'ls', 'mkdir', 'pwd', 'rm', 'touch', 'which']);
const runnerCommand =
    /^(?:(?:npm|pnpm|yarn|bun)\s+(?:test|run|build|install|ci|x)\b|(?:npx|bunx|pytest|vitest|jest|tsc|cargo|go|make|gradle|mvn|swift|xcodebuild|uv|deno)\b)/u;

/**
 * Real `haus` commands, from the Agent CLI's own dispatcher
 * (`apps/computer/src/agent-cli.ts`), as [past, present].
 */
const hausVerbs: Record<string, readonly [string, string]> = {
    'attachment upload': ['Uploaded a file', 'Uploading a file'],
    'inbox check': ['Checked inbox', 'Checking inbox'],
    'message check': ['Checked messages', 'Checking messages'],
    'message react': ['Reacted to a message', 'Reacting to a message'],
    'message read': ['Read messages', 'Reading messages'],
    'message resolve': ['Looked up a message', 'Looking up a message'],
    'message search': ['Searched messages', 'Searching messages'],
    'message send': ['Sent a message', 'Sending a message'],
    'task claim': ['Claimed a task', 'Claiming a task'],
    'task create': ['Created a task', 'Creating a task'],
    'task list': ['Listed tasks', 'Listing tasks'],
    'task unclaim': ['Released a task', 'Releasing a task'],
    'task update': ['Updated a task', 'Updating a task'],
    'thread unfollow': ['Unfollowed a thread', 'Unfollowing a thread'],
};

export function formatShellLabel(command: string, tense: TraceTense = 'past'): string {
    return readShellLabel(command)[tense];
}

export function readShellLabel(command: string): ShellLabel {
    const script = parseShellScript(unwrapShellCommand(command));
    const heads = script.commands.filter((entry) => !entry.piped);
    // `echo x > notes.md` writes a file; only a bare echo is setup.
    const meaningful = heads.filter(
        (entry) => entry.writes !== null || !noisePrograms.has(entry.program)
    );
    const haus = meaningful.filter((entry) => entry.program === 'haus');
    const base = { extraCommands: 0, isHausOnly: false, lines: script.lines };

    if (heads.length === 0) {
        return { ...base, past: 'Ran a command', present: 'Running a command' };
    }
    if (haus.length > 0 && haus.length === meaningful.length) {
        return { ...base, ...readHausLabel(haus), isHausOnly: true };
    }
    if (
        script.lines === 1 &&
        !script.hasHeredoc &&
        haus.length === 0 &&
        heads[0] === meaningful[0]
    ) {
        const typed = clampLabel(
            script.commands.length === 1 ? (heads[0]?.text ?? '') : readFirstLine(command)
        );
        return { ...base, past: `Ran ${typed}`, present: `Running ${typed}` };
    }
    return {
        ...base,
        ...readCompoundLabel(meaningful.filter((entry) => entry.program !== 'haus')),
    };
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

function readHausLabel(commands: readonly ShellCommand[]) {
    const verbs = commands.filter((entry) => !isHelp(entry)).map(readHausVerb);
    const extraCommands = commands.length - 1;
    if (verbs.length === 0) {
        return { extraCommands, past: 'Read haus help', present: 'Reading haus help' };
    }
    const [first] = verbs;
    if (Array.isArray(first)) {
        return { extraCommands, past: `${first[0]} with haus`, present: `${first[1]} with haus` };
    }
    const typed = clampLabel(commands.find((entry) => !isHelp(entry))?.text ?? 'haus');
    return { extraCommands, past: `Ran ${typed}`, present: `Running ${typed}` };
}

/** Writes fold into a count; the heaviest other command names the row. */
function readCompoundLabel(commands: readonly ShellCommand[]) {
    const writes = commands.filter((entry) => entry.writes !== null);
    const others = commands.filter((entry) => entry.writes === null);
    const best = others.reduce<ShellCommand | null>(
        (winner, entry) => (winner && weigh(winner) >= weigh(entry) ? winner : entry),
        null
    );
    const extraCommands = Math.max(0, others.length - 1);
    const wrote =
        writes.length === 1 ? basenameOf(writes[0]?.writes ?? '') : `${writes.length} files`;
    const ran = best ? clampLabel(best.text) : null;

    if (writes.length > 0 && ran) {
        return {
            extraCommands,
            past: `Wrote ${wrote}, ran ${ran}`,
            present: `Writing ${wrote}, running ${ran}`,
        };
    }
    if (writes.length > 0) {
        return { extraCommands: 0, past: `Wrote ${wrote}`, present: `Writing ${wrote}` };
    }
    if (ran) {
        return { extraCommands, past: `Ran ${ran}`, present: `Running ${ran}` };
    }
    return { extraCommands: 0, past: 'Ran a script', present: 'Running a script' };
}

function weigh(command: ShellCommand): number {
    if (runnerCommand.test(command.text)) {
        return 3;
    }
    return minorPrograms.has(command.program) ? 1 : 2;
}

function isHelp(command: ShellCommand): boolean {
    const words = command.text.split(' ');
    return words.includes('--help') || words.includes('-h') || words[1] === 'help';
}

function readHausVerb(command: ShellCommand): readonly [string, string] | null {
    const words = command.text.split(' ').slice(1);
    const group = words[0] ?? '';
    const subcommand = words[1]?.startsWith('-') ? '' : (words[1] ?? '');
    return hausVerbs[`${group} ${subcommand}`.trim()] ?? hausVerbs[group] ?? null;
}

function readFirstLine(command: string): string {
    const line = unwrapShellCommand(command)
        .split('\n')
        .find((entry) => entry.trim().length > 0);
    return (line ?? '').replace(/\s+/gu, ' ').trim();
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

function clampLabel(summary: string): string {
    return summary.length > labelMaxChars
        ? `${summary.slice(0, labelMaxChars - 1).trimEnd()}…`
        : summary;
}
