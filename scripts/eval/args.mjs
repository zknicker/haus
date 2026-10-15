// Argument parsing for `bun run eval`. Pure: returns the parsed options or
// throws UsageError, so a typo never turns into a live-agent run.

export const usage =
    'usage: bun run eval <name> [--baseline <sha>] [--passes <n>] [--lanes <n>] [--model <runtime/model>] [--notes <file>] [--list]';

export class UsageError extends Error {
    constructor(message) {
        super(`${message}\n  ${usage}`);
        this.name = 'UsageError';
    }
}

const defaults = Object.freeze({ passes: 3 });

/** `lanes` stays null unless passed: the eval's own default (else 3) applies. */
export function parseEvalArgs(argv) {
    const parsed = {
        baseline: null,
        lanes: null,
        list: false,
        model: null,
        name: null,
        notes: null,
        passes: defaults.passes,
    };
    const rest = [...argv];
    while (rest.length > 0) {
        const arg = rest.shift();
        if (arg === '--list') {
            parsed.list = true;
        } else if (arg === '--baseline') {
            // Any git revision: a sha, a branch, origin/main, HEAD~2.
            parsed.baseline = takeValue(rest, arg, /^[\w./~^-]+$/u);
        } else if (arg === '--passes' || arg === '--lanes') {
            parsed[arg.slice(2)] = takeCount(rest, arg);
        } else if (arg === '--model') {
            parsed.model = parseModel(takeValue(rest, arg));
        } else if (arg === '--notes') {
            parsed.notes = takeValue(rest, arg);
        } else if (arg.startsWith('--')) {
            throw new UsageError(`Unknown option ${arg}.`);
        } else if (parsed.name) {
            throw new UsageError(`One eval at a time; got ${parsed.name} and ${arg}.`);
        } else {
            parsed.name = arg;
        }
    }
    if (!(parsed.list || parsed.name)) {
        throw new UsageError('Name an eval, or pass --list.');
    }
    return parsed;
}

/** `runtime/model` → `{ runtimeId, modelId }`; the model part may itself contain slashes. */
export function parseModel(value) {
    const at = value.indexOf('/');
    if (at <= 0 || at === value.length - 1) {
        throw new UsageError(`--model needs <runtime>/<model>, got ${JSON.stringify(value)}.`);
    }
    return { label: value, modelId: value.slice(at + 1), runtimeId: value.slice(0, at) };
}

function takeValue(rest, flag, pattern) {
    const value = rest.shift();
    if (!value || value.startsWith('--')) {
        throw new UsageError(`${flag} needs a value.`);
    }
    if (pattern && !pattern.test(value)) {
        throw new UsageError(`${flag} got an unusable value ${JSON.stringify(value)}.`);
    }
    return value;
}

function takeCount(rest, flag) {
    const raw = takeValue(rest, flag);
    const count = Number(raw);
    if (!(Number.isInteger(count) && count >= 1)) {
        throw new UsageError(`${flag} needs a whole number of at least 1, got ${raw}.`);
    }
    return count;
}
