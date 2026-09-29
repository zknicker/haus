import {
    type CliCommand,
    type CliFlag,
    type ParsedArgs,
    parseArgs,
    suggest,
    UsageError,
} from './parse.ts';
import { errorBlock, heading, rows } from './ui.ts';

/**
 * One subcommand under a group (e.g. `wiki list`, `engine status`). Declares
 * its own flags, positionals, usage, and run() so the framework validates args
 * and renders per-subcommand help uniformly across groups.
 */
export interface SubCommand {
    /** Let the command produce its own stable error for otherwise unsupported positional input. */
    allowExtraPositionals?: boolean;
    examples: string[];
    flags: CliFlag[];
    name: string;
    /** Behavior the flags cannot state on their own, e.g. what a repeated run does. */
    notes?: string[];
    /** Positional names for usage/help and arity validation, e.g. `['<topic>']`. */
    positionals: string[];
    /** Run the subcommand with validated args. Returns the process exit code. */
    run(args: ParsedArgs): Promise<number>;
    summary: string;
    usage: string;
}

/**
 * Dispatch a group's raw argv to one of its subcommands. Validates flags against
 * the subcommand spec (UsageError → exit 2 with that subcommand's help) and
 * handles `--help` and unknown-subcommand suggestions. `groupName` prefixes
 * error/help copy ('haus wiki ...').
 */
export async function dispatchSubcommand(
    groupName: string,
    subs: SubCommand[],
    raw: string[]
): Promise<number> {
    const [name, ...rest] = raw;
    const sub = subs.find((entry) => entry.name === name);
    if (!sub) {
        return reportUnknownSub(groupName, name, subs);
    }

    try {
        const spec = toCliCommand(groupName, sub);
        const parsed = parseArgs(spec, rest);
        if (parsed.help) {
            printSubHelp(sub, process.stdout);
            return 0;
        }
        validateArity(spec, sub, parsed);
        return await sub.run(parsed);
    } catch (error) {
        if (error instanceof UsageError) {
            printSubHelp(sub, process.stderr);
            process.stderr.write(`\n${errorBlock(error.message)}\n`);
            return 2;
        }
        throw error;
    }
}

/** Exact-arity check for declared positionals; UsageError carries the spec. */
function validateArity(spec: CliCommand, sub: SubCommand, parsed: ParsedArgs): void {
    if (sub.allowExtraPositionals) {
        return;
    }
    const expected = sub.positionals.length;
    if (parsed.positionals.length === expected) {
        return;
    }
    const noun = expected === 1 ? 'argument' : 'arguments';
    const got = parsed.positionals.length;
    throw new UsageError(
        `Expected ${expected} ${noun}${expected > 0 ? ` (${sub.positionals.join(' ')})` : ''}, got ${got}.`,
        spec
    );
}

/** Adapt a SubCommand to the CliCommand shape `parseArgs` validates against. */
function toCliCommand(groupName: string, sub: SubCommand): CliCommand {
    return {
        name: groupName ? `${groupName} ${sub.name}` : sub.name,
        section: groupName === 'engine' ? 'Engine' : 'Status',
        summary: sub.summary,
        usage: sub.usage,
        flags: sub.flags,
        examples: sub.examples,
        run: () => Promise.resolve(0),
    };
}

function reportUnknownSub(groupName: string, name: string | undefined, subs: SubCommand[]): number {
    const names = subs.map((entry) => entry.name);
    const hint = name ? suggest(name, names) : null;
    process.stderr.write(
        `${errorBlock(
            name ? `Unknown ${groupName} command '${name}'.` : `Missing ${groupName} command.`,
            hint
                ? `Did you mean '${groupName} ${hint}'?`
                : `Run 'haus ${groupName} --help' for the command list.`
        )}\n`
    );
    return 2;
}

/** Per-subcommand help: summary, usage, flags, examples. */
export function printSubHelp(sub: SubCommand, stream: NodeJS.WriteStream): void {
    const blocks: string[] = [sub.summary, `${heading('Usage', stream)}\n  ${sub.usage}`];
    const flags = sub.flags.filter((flag) => !flag.removed);
    if (flags.length > 0) {
        const body = rows(
            flags.map((flag) => ({
                left: flag.valueName ? `${flag.name} ${flag.valueName}` : flag.name,
                right: flag.description,
            })),
            '  '
        );
        blocks.push(`${heading('Flags', stream)}\n${body}`);
    }
    if (sub.notes && sub.notes.length > 0) {
        blocks.push(
            `${heading('Notes', stream)}\n${sub.notes.map((note) => `  ${note}`).join('\n')}`
        );
    }
    if (sub.examples.length > 0) {
        const body = sub.examples.map((example) => `  ${example}`).join('\n');
        blocks.push(`${heading('Examples', stream)}\n${body}`);
    }
    stream.write(`${blocks.join('\n\n')}\n`);
}
