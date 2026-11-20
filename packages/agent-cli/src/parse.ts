export interface CliFlag {
    description: string;
    name: string;
    /** A flag this command no longer takes. Using it fails with this message. */
    removed?: string;
    valueName?: string;
}

export interface CliCommand {
    examples: string[];
    flags: CliFlag[];
    name: string;
    run(args: ParsedArgs, raw: string[]): Promise<number>;
    section: string;
    summary: string;
    usage: string;
}

/** Usage error → exit code 2. Carries the command whose help to print, if any. */
export class UsageError extends Error {
    constructor(
        message: string,
        readonly command?: CliCommand
    ) {
        super(message);
        this.name = 'UsageError';
    }
}

/** Parsed argv for a resolved command: boolean flags, valued flags, positionals. */
export interface ParsedArgs {
    /** Boolean flags present, e.g. `{ '--json': true }`. */
    flags: Record<string, boolean>;
    /** True when `--help`/`-h` appeared anywhere. */
    help: boolean;
    /** Non-flag positionals in order. */
    positionals: string[];
    /** Every value for repeatable valued flags, in command-line order. */
    valueLists?: Record<string, string[]>;
    /** Valued flags, e.g. `{ '--topic': 'foo' }`. */
    values: Record<string, string>;
}

function flagTakesValue(flag: CliFlag): boolean {
    return Boolean(flag.valueName);
}

/**
 * Validate raw args against a command's declared flag spec. Unknown flags or
 * missing flag values raise UsageError (the caller prints that command's help to
 * stderr and exits 2). `--help`/`-h` short-circuit validation.
 */
export function parseArgs(command: CliCommand, args: string[]): ParsedArgs {
    const parsed: ParsedArgs = {
        flags: {},
        values: {},
        valueLists: {},
        positionals: [],
        help: false,
    };
    const known = new Map(command.flags.map((flag) => [flag.name, flag] as const));

    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === '--help' || arg === '-h') {
            parsed.help = true;
            continue;
        }
        if (!arg.startsWith('--')) {
            parsed.positionals.push(arg);
            continue;
        }
        const flag = known.get(arg);
        if (!flag) {
            throw new UsageError(`Unknown flag '${arg}' for 'haus ${command.name}'.`, command);
        }
        if (flag.removed) {
            throw new UsageError(flag.removed, command);
        }
        if (flagTakesValue(flag)) {
            const value = args[index + 1];
            if (value === undefined || value.startsWith('--')) {
                throw new UsageError(`Flag '${arg}' requires a value.`, command);
            }
            parsed.values[arg] = value;
            const previousValues = parsed.valueLists?.[arg];
            if (previousValues) {
                previousValues.push(value);
            } else if (parsed.valueLists) {
                parsed.valueLists[arg] = [value];
            }
            index++;
        } else {
            parsed.flags[arg] = true;
        }
    }

    return parsed;
}

/** Levenshtein distance, capped use for did-you-mean (≤ 2). */
export function levenshtein(a: string, b: string): number {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dist: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
    for (let i = 0; i < rows; i++) {
        dist[i][0] = i;
    }
    for (let j = 0; j < cols; j++) {
        dist[0][j] = j;
    }
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            dist[i][j] = Math.min(
                dist[i - 1][j] + 1,
                dist[i][j - 1] + 1,
                dist[i - 1][j - 1] + cost
            );
        }
    }
    return dist[a.length][b.length];
}

/** Nearest candidate within Levenshtein distance 2, or null. */
export function suggest(input: string, candidates: string[]): string | null {
    let best: string | null = null;
    let bestDist = 3;
    for (const candidate of candidates) {
        const dist = levenshtein(input, candidate);
        if (dist < bestDist) {
            bestDist = dist;
            best = candidate;
        }
    }
    return best;
}
