import {
    parseShellScript,
    type ShellCommand,
    unwrapShellCommand,
} from './execution-shell-script.ts';
import { readExecutionToolKind } from './execution-tool-kind.ts';

/**
 * Whether one execution-journal tool call was the Agent's Haus bookkeeping
 * rather than its work: a script of only `haus` CLI calls (setup such as `cd`
 * aside), a native message send, or `MEMORY.md` upkeep at the workspace root.
 * The App's turn trace mutes these calls and the Computer's execution outline
 * files them as `bookkeeping`, so a call reads the same in both. A sub-agent is
 * never bookkeeping; callers that know a call ran one say so first.
 */
export function isExecutionBookkeeping(tool: {
    readonly input: unknown;
    readonly toolName: string;
}): boolean {
    const input = readInput(tool.input);
    switch (readExecutionToolKind(tool.toolName)) {
        case 'message':
            return true;
        case 'shell': {
            const command = readCommand(input);
            return command !== null && isHausOnlyShellScript(command);
        }
        case 'file-change':
        case 'file-edit':
        case 'file-read':
        case 'file-write':
        case 'search': {
            const path = readPath(input);
            return path !== null && relativizeWorkspacePath(path.trim()) === memoryFile;
        }
        default:
            return false;
    }
}

/** Every command a script runs is a `haus` CLI call, once setup is set aside. */
export function isHausOnlyShellScript(command: string): boolean {
    const meaningful = parseShellScript(unwrapShellCommand(command)).commands.filter(
        (entry) => !(entry.piped || isShellSetupCommand(entry))
    );
    return meaningful.length > 0 && meaningful.every((entry) => entry.program === 'haus');
}

/** Setup and shell syntax that never names what a script did; a redirect that writes still does. */
export function isShellSetupCommand(command: ShellCommand): boolean {
    return command.writes === null && setupPrograms.has(command.program);
}

/**
 * Computer journals sub-agent paths as absolute host paths today; the
 * top-level Agent's are already relative. An absolute path inside an Agent
 * workspace loses everything up to it, and one in the Agent's home reads `~/…`.
 */
export function relativizeWorkspacePath(path: string): string {
    const relative = path.replace(workspacePrefix, '');
    if (relative !== path) {
        return relative || '<workspace>';
    }
    return path.replace(homePrefix, '~');
}

const memoryFile = 'MEMORY.md';
const workspacePrefix = /^\/(?:[^/]+\/)*agents\/[^/]+\/workspace(?:\/|$)/u;
const homePrefix = /^\/(?:[^/]+\/)*agents\/[^/]+\/home(?=\/|$)/u;

const setupPrograms = new Set([
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

/** A journal input is an object, or that object as JSON text. */
function readInput(input: unknown): Record<string, unknown> {
    let value = input;
    if (typeof value === 'string') {
        try {
            value = JSON.parse(value);
        } catch {
            return {};
        }
    }
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

/** `command` or `cmd` as a script, or a `["bash", "-lc", "…"]` argv as its script. */
function readCommand(input: Record<string, unknown>): string | null {
    const command = input.command ?? input.cmd;
    if (typeof command === 'string') {
        return command;
    }
    if (Array.isArray(command) && command.every((part) => typeof part === 'string')) {
        const [shell, flags, script] = command as string[];
        return command.length === 3 && isShell(shell) && flags?.includes('c')
            ? (script ?? null)
            : command.join(' ');
    }
    return null;
}

function readPath(input: Record<string, unknown>): string | null {
    const path = input.file_path ?? input.path ?? input.filePath;
    return typeof path === 'string' ? path : null;
}

function isShell(program: string | undefined): boolean {
    return /^(?:\S*\/)?(?:sh|bash|zsh|dash|ksh)$/u.test(program ?? '');
}
