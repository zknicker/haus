import { readHausVerb } from './turn-trace-haus-command.ts';
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
/** A line that opens with shell syntax reads as the command inside it, never as typed. */
const controlLead = /^(?:if|while|until|for|case|select|!)\s/u;
const doubleQuoteEscape = /\\(["$\\`])/gu;

/** Setup and shell syntax that never name a row. */
const noisePrograms = new Set([
    '.',
    ':',
    '[',
    '[[',
    '{',
    '}',
    'case',
    'do',
    'done',
    'elif',
    'else',
    'esac',
    'fi',
    'for',
    'select',
    'test',
    'then',
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
        heads[0] === meaningful[0] &&
        !controlLead.test(readFirstLine(command))
    ) {
        const idiom = heads[0] ? readIdiom(script.commands, heads[0]) : null;
        if (idiom) {
            return { ...base, past: idiom[0], present: idiom[1] };
        }
        const typed = clampLabel(
            script.commands.length === 1 ? (heads[0]?.text ?? '') : readFirstLine(command)
        );
        return { ...base, past: `Ran ${typed}`, present: `Running ${typed}` };
    }
    return {
        ...base,
        ...readCompoundLabel(
            meaningful.filter((entry) => entry.program !== 'haus'),
            (entry) => readIdiom(script.commands, entry)
        ),
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
    const verbs = commands
        .filter((entry) => !isHelp(entry))
        .map((entry) => readHausVerb(entry.text));
    const extraCommands = commands.length - 1;
    if (verbs.length === 0) {
        return { extraCommands, past: 'Read haus help', present: 'Reading haus help' };
    }
    const [first] = verbs;
    if (Array.isArray(first)) {
        return { extraCommands, past: first[0], present: first[1] };
    }
    const typed = clampLabel(commands.find((entry) => !isHelp(entry))?.text ?? 'haus');
    return { extraCommands, past: `Ran ${typed}`, present: `Running ${typed}` };
}

/** Writes fold into a count; the heaviest other command names the row. */
function readCompoundLabel(
    commands: readonly ShellCommand[],
    describe: (command: ShellCommand) => readonly [string, string] | null
) {
    const writes = commands.filter((entry) => entry.writes !== null);
    const others = commands.filter((entry) => entry.writes === null);
    const best = others.reduce<ShellCommand | null>(
        (winner, entry) => (winner && weigh(winner) >= weigh(entry) ? winner : entry),
        null
    );
    const extraCommands = Math.max(0, others.length - 1);
    const wrote =
        writes.length === 1 ? basenameOf(writes[0]?.writes ?? '') : `${writes.length} files`;
    const idiom = best ? describe(best) : null;
    const ran = best ? clampLabel(best.text) : null;

    if (writes.length > 0 && ran) {
        return {
            extraCommands,
            past: `Wrote ${wrote}, ${idiom ? lowerFirst(idiom[0]) : `ran ${ran}`}`,
            present: `Writing ${wrote}, ${idiom ? lowerFirst(idiom[1]) : `running ${ran}`}`,
        };
    }
    if (writes.length > 0) {
        return { extraCommands: 0, past: `Wrote ${wrote}`, present: `Writing ${wrote}` };
    }
    if (idiom) {
        return { extraCommands, past: idiom[0], present: idiom[1] };
    }
    if (ran) {
        return { extraCommands, past: `Ran ${ran}`, present: `Running ${ran}` };
    }
    return { extraCommands: 0, past: 'Ran a script', present: 'Running a script' };
}

/**
 * A pipeline whose purpose has a plainer name than its syntax:
 * `find packages -type f | wc -l` counted the files in packages.
 */
function readIdiom(
    commands: readonly ShellCommand[],
    head: ShellCommand
): readonly [string, string] | null {
    const filter = commands[commands.indexOf(head) + 1];
    if (!(head.program === 'find' && filter?.piped && /^wc\s+-l$/u.test(filter.text))) {
        return null;
    }
    const root = head.text.split(' ')[1];
    const place =
        root && !root.startsWith('-') && root !== '.' ? ` in ${root.replace(/\/$/u, '')}` : '';
    return [`Counted files${place}`, `Counting files${place}`];
}

function lowerFirst(value: string): string {
    return value.charAt(0).toLowerCase() + value.slice(1);
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

    // `'\''` is how a single-quoted wrapper spells a quote inside it.
    return quote === '"' ? inner.replace(doubleQuoteEscape, '$1') : inner.replace(/'\\''/gu, "'");
}

function clampLabel(summary: string): string {
    return summary.length > labelMaxChars
        ? `${summary.slice(0, labelMaxChars - 1).trimEnd()}…`
        : summary;
}
