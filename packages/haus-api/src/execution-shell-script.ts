/**
 * Splits a shell script into the commands a person would recognize.
 *
 * Heredoc bodies are skipped (they are file contents or message text, not
 * commands), line continuations join, and unquoted `;`, `&&`, `||`, `|`, `&`
 * separate commands. A pipeline's filters (`| head -3`) are marked `piped` so
 * they never name a row. This is a display heuristic, not a shell parser: it
 * degrades to "the line as typed" rather than failing.
 */

export interface ShellCommand {
    /** Follows a `|`: an output filter of the command before it. */
    readonly piped: boolean;
    /** The program word: `npm`, `haus`, `cd`. */
    readonly program: string;
    /** The command with its leading env assignments and stderr redirects removed. */
    readonly text: string;
    /** The file a `>`/`>>` redirect writes, when it is a real file. */
    readonly writes: string | null;
}

export interface ShellScript {
    readonly commands: readonly ShellCommand[];
    readonly hasHeredoc: boolean;
    /** Logical lines outside heredoc bodies. */
    readonly lines: number;
}

/** Only an opener that ends its line (or precedes a redirect or pipe) starts a document. */
const heredocOpener = /<<-?\s*(['"]?)([A-Za-z_][\w-]*)\1(?=\s*(?:[|;&>].*)?$)/gu;
const stderrRedirect = /\s*\d?>&\d|\s*\d>\s*\/dev\/null/gu;
const writeRedirect = /(?:^|\s)\d?>>?\s*(?!&)("[^"]*"|'[^']*'|[^\s;|&<>]+)/u;
const quotedString = /'[^']*'|"(?:\\.|[^"\\])*"/gu;
const envAssignment = /^(?:env\s+)?(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/u;
/** `if`/`then`/`while` lead the command they guard; the command is what ran. */
const controlPrefix = /^(?:(?:if|then|else|elif|do|while|until|!)\s+)+/u;

export function parseShellScript(script: string): ShellScript {
    const commands: ShellCommand[] = [];
    let lines = 0;
    let hasHeredoc = false;

    for (const line of readLogicalLines(script)) {
        const delimiters = [...line.matchAll(heredocOpener)];
        hasHeredoc ||= delimiters.length > 0;
        const text = line.replace(heredocOpener, '').trim();
        if (text.length === 0) {
            continue;
        }
        lines += 1;
        for (const segment of splitCommands(text)) {
            const command = readCommand(segment.text, segment.piped);
            if (command) {
                commands.push(command);
            }
        }
    }

    return { commands, hasHeredoc, lines };
}

/** Lines outside heredoc bodies, with `\`-continued lines joined. */
function readLogicalLines(script: string): string[] {
    const raw = script.split('\n');
    const result: string[] = [];
    let pending: string[] = [];
    let current = '';

    for (const line of raw) {
        if (pending.length > 0) {
            if (line.trim() === pending[0]) {
                pending = pending.slice(1);
            }
            continue;
        }
        if (line.endsWith('\\')) {
            current += `${line.slice(0, -1)} `;
            continue;
        }
        const logical = current + line;
        current = '';
        result.push(logical);
        pending = [...logical.matchAll(heredocOpener)].map((match) => match[2] ?? '');
    }
    if (current.length > 0) {
        result.push(current);
    }
    return result;
}

interface Segment {
    readonly piped: boolean;
    readonly text: string;
}

function splitCommands(line: string): Segment[] {
    const segments: Segment[] = [];
    let quote: string | null = null;
    let start = 0;
    let piped = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index] ?? '';
        if (char === '\\' && quote !== "'") {
            index += 1;
            continue;
        }
        if (quote || char === '"' || char === "'") {
            quote = quote ? (char === quote ? null : quote) : char;
            continue;
        }
        const operator = readOperator(line, index);
        if (operator) {
            segments.push({ piped, text: line.slice(start, index) });
            piped = operator.pipes;
            index += operator.length - 1;
            start = index + 1;
        }
    }
    segments.push({ piped, text: line.slice(start) });
    return segments;
}

/** An unquoted `;`, `&&`, `||`, `|`, or background `&` at `index`. */
function readOperator(line: string, index: number): { length: number; pipes: boolean } | null {
    const char = line[index];
    if (char === ';') {
        return { length: 1, pipes: false };
    }
    if (char !== '|' && char !== '&') {
        return null;
    }
    if (char === '&' && isRedirection(line, index)) {
        return null;
    }
    const doubled = line[index + 1] === char;
    return { length: doubled ? 2 : 1, pipes: char === '|' && !doubled };
}

/** `2>&1` and `&>` are redirections, not a second command. */
function isRedirection(line: string, index: number): boolean {
    const previous = line[index - 1];
    return previous === '>' || previous === '<' || line[index + 1] === '>';
}

function readCommand(segment: string, piped: boolean): ShellCommand | null {
    const unwrapped = segment.trim().replace(/^\(+/u, '').replace(/\)+$/u, '').trim();
    const text = unwrapped
        .replace(controlPrefix, '')
        .replace(envAssignment, '')
        .replace(stderrRedirect, '')
        .trim();
    if (text.length === 0) {
        return null;
    }
    const target = readWriteTarget(text);
    const programWord = text.split(/\s+/u)[0]?.replace(/^['"]|['"]$/gu, '') ?? '';
    return {
        piped,
        program: programWord.split('/').at(-1) ?? programWord,
        text: text.replace(/\s+/gu, ' '),
        writes: target && target !== '/dev/null' ? target : null,
    };
}

/**
 * The file a `>`/`>>` redirect writes. Quoted text is masked first (same
 * length), so a `>` inside quoted code (`node -e 'a > b'`) is not a redirect,
 * while a quoted target (`> "out file.txt"`) still reads from the original.
 */
function readWriteTarget(text: string): string | null {
    const masked = text.replace(
        quotedString,
        (quoted) => `${quoted[0]}${'_'.repeat(quoted.length - 2)}${quoted.at(-1)}`
    );
    const match = writeRedirect.exec(masked);
    const maskedTarget = match?.[1];
    if (!(match && maskedTarget)) {
        return null;
    }
    const start = match.index + match[0].length - maskedTarget.length;
    return text.slice(start, start + maskedTarget.length).replace(/^['"]|['"]$/gu, '');
}
