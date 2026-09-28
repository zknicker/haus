import type { ComputerAgentActivityCategory } from '../agent-activity.ts';
import type { ComputerToolClassification } from './activity-tool-fixtures.ts';

/** A known tool's activity, or `skip` for a shell call that only runs the `haus` CLI. */
export function classifyShellCall(
    category: ComputerAgentActivityCategory,
    input: unknown
): ComputerToolClassification {
    return category === 'running_command' && isHausCliCommand(input)
        ? { outcome: 'skip' }
        : { category, outcome: 'activity' };
}

/**
 * Recognizes a shell tool call whose whole command is one `haus` CLI
 * invocation: `haus message check`, `/abs/bin/haus task claim …`,
 * `env HAUS_X=1 haus …`, a runtime's `/bin/zsh -lc "…"` wrapper, and a
 * heredoc send (`haus message send … <<'HAUSMSG'` … `HAUSMSG`).
 *
 * Such a call is Agent bookkeeping, not a command the person would call work:
 * the structured proxy already reports its message checks, the Server its
 * sends, and task or profile updates are not work at all. It never becomes a
 * thought either; any other command may, only as a scrubbed description
 * (`thought-action.ts`, ADR 0036). A compound command (`haus … && curl …`) is
 * real work and stays a command.
 */
export function isHausCliCommand(input: unknown): boolean {
    const command = readShellCommand(input);
    if (!command) {
        return false;
    }
    const script = stripHeredoc(unwrapShell(command.trim()));
    if (script === null || hasControlOperator(script)) {
        return false;
    }
    const words = script.trim().split(/\s+/u);
    let index = words[0] === 'env' ? 1 : 0;
    while (words[index] && /^[A-Za-z_][A-Za-z0-9_]*=/u.test(words[index] ?? '')) {
        index += 1;
    }
    const program = words[index]?.replace(/^['"]|['"]$/gu, '') ?? '';
    return program === 'haus' || program.endsWith('/haus');
}

/** A tool input's command string: `{ command }` as an object or JSON, or an argv array. */
export function readShellCommand(input: unknown): string | null {
    let value = input;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return null;
        }
    }
    const command =
        typeof value === 'object' && value !== null
            ? (value as { command?: unknown }).command
            : undefined;
    if (typeof command === 'string') {
        return command;
    }
    if (Array.isArray(command) && command.every((part) => typeof part === 'string')) {
        const [shell, flags, script] = command as string[];
        // ["bash", "-lc", "haus …"] runs the script; any other argv is the program itself.
        return command.length === 3 && isShell(shell) && flags?.includes('c')
            ? (script ?? null)
            : command.join(' ');
    }
    return null;
}

const shellWrapper = /^(\S+)\s+(-[A-Za-z]+)\s+([\s\S]+)$/u;

/** `/bin/zsh -lc "haus …"` → `haus …`; anything else is returned as it is. */
export function unwrapShell(command: string): string {
    const match = shellWrapper.exec(command);
    if (!(match?.[1] && isShell(match[1]) && match[2]?.includes('c') && match[3])) {
        return command;
    }
    const script = match[3].trim();
    const quote = script[0];
    if ((quote === '"' || quote === "'") && script.endsWith(quote) && script.length > 1) {
        const inner = script.slice(1, -1);
        return quote === '"' ? inner.replace(/\\(["$\\`])/gu, '$1') : inner;
    }
    return script;
}

function isShell(program: string | undefined): boolean {
    return /^(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)$/u.test(program ?? '');
}

const heredocOpener = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1\s*$/u;

/**
 * The first line without its heredoc opener when the document runs to its
 * terminator and nothing follows; the script itself when there is no heredoc;
 * null when a heredoc is followed by more commands.
 */
function stripHeredoc(script: string): string | null {
    const [first = '', ...rest] = script.split('\n');
    const opener = heredocOpener.exec(first);
    if (!opener) {
        return script;
    }
    const tag = opener[2];
    const end = rest.findIndex((line) => line.trim() === tag);
    if (end === -1 || rest.slice(end + 1).some((line) => line.trim().length > 0)) {
        return null;
    }
    return first.slice(0, opener.index);
}

/** An unquoted `;`, `&&`, `||`, `|`, background `&`, or line break chains another command. */
function hasControlOperator(script: string): boolean {
    let quote: string | null = null;
    for (let index = 0; index < script.length; index += 1) {
        const char = script[index];
        if (char === '\\' && quote !== "'") {
            index += 1;
        } else if (quote) {
            quote = char === quote ? null : quote;
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (isControlOperator(script, index)) {
            return true;
        }
    }
    return quote !== null;
}

function isControlOperator(script: string, index: number): boolean {
    const char = script[index];
    if (char !== '&') {
        return char === ';' || char === '|' || char === '\n';
    }
    // `2>&1` and `&>` are redirections, not a second command.
    const previous = script[index - 1];
    return !(previous === '>' || previous === '<' || script[index + 1] === '>');
}
