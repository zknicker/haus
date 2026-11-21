import type { ComputerAgentActivityCategory } from '@haus/computer/src/agent-activity.ts';
import { readShellCommand, unwrapShell } from '@haus/computer/src/harness/haus-cli-command.ts';
import { isSecretName } from '@haus/computer/src/harness/thought-action-scrub.ts';
import { admitsFilter, isPathLike, shellPipeline } from './shell-pipeline.ts';

export interface ToolOperation {
    readonly category: ComputerAgentActivityCategory | null;
    readonly input: unknown;
}

export function admitsResult(operation: ToolOperation) {
    switch (operation.category) {
        case 'searching_web':
            return true;
        case 'browsing':
            return isWebUrl(urlOf(operation.input));
        case 'running_command':
            return admitsCommand(operation.input);
        default:
            return false;
    }
}

function admitsCommand(input: unknown) {
    const command = readShellCommand(input);
    const segments = command ? shellPipeline(unwrapShell(command.trim())) : null;
    if (!segments) {
        return false;
    }
    const [source = [], ...filters] = segments;
    return admitsSource(source) && filters.every(admitsFilter);
}

function admitsSource(words: readonly string[]) {
    const [program = '', ...args] = words;
    if (program === 'curl') {
        return admitsCurl(args);
    }
    const shape = sourceShapes.find((candidate) =>
        candidate.every((word, index) => words[index] === word)
    );
    if (!shape) {
        return false;
    }
    return words
        .slice(shape.length)
        .every((arg) => arg === './...' || !(isPathLike(arg) || contentFlags.has(arg)));
}

const sourceShapes: readonly (readonly string[])[] = [
    ['bun', 'test'],
    ['npm', 'test'],
    ['npm', 'run', 'test'],
    ['pnpm', 'test'],
    ['pnpm', 'run', 'test'],
    ['yarn', 'test'],
    ['cargo', 'test'],
    ['go', 'test'],
    ['pytest'],
    ['vitest', 'run'],
    ['git', 'status'],
    ['git', 'log'],
    ['git', 'branch'],
    ['git', 'tag'],
    ['git', 'describe'],
    ['git', 'rev-parse'],
    ['gh', 'pr', 'status'],
    ['gh', 'pr', 'checks'],
    ['gh', 'pr', 'list'],
    ['gh', 'run', 'list'],
    ['gh', 'run', 'view'],
    ['gh', 'release', 'list'],
    ['gh', 'issue', 'list'],
];

const contentFlags = new Set([
    '-p',
    '-u',
    '-L',
    '--patch',
    '--unified',
    '--full-diff',
    '--word-diff',
    '--log',
    '--log-failed',
]);

function admitsCurl(args: readonly string[]) {
    let urls = 0;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index] ?? '';
        if (/^-[sSfLkiI]+$/u.test(arg) || curlSwitches.has(arg)) {
            continue;
        }
        if (curlValueFlags.has(arg)) {
            index += 1;
            if (!admitsCurlValue(arg, args[index])) {
                return false;
            }
            continue;
        }
        if (!isWebUrl(arg)) {
            return false;
        }
        urls += 1;
    }
    return urls > 0;
}

const curlSwitches = new Set([
    '--compressed',
    '--fail',
    '--fail-with-body',
    '--globoff',
    '--head',
    '--include',
    '--insecure',
    '--location',
    '--show-error',
    '--silent',
]);

const curlValueFlags = new Set([
    '-A',
    '-H',
    '-X',
    '-m',
    '--connect-timeout',
    '--header',
    '--max-time',
    '--request',
    '--retry',
    '--user-agent',
]);

function admitsCurlValue(flag: string, value: string | undefined) {
    if (!value || value.startsWith('@')) {
        return false;
    }
    if (flag === '-H' || flag === '--header') {
        const name = value.split(':')[0]?.trim() ?? '';
        return name.length > 0 && !isSecretName(name) && !/cookie/iu.test(name);
    }
    if (flag === '-X' || flag === '--request') {
        return value === 'GET' || value === 'HEAD';
    }
    return flag === '-A' || flag === '--user-agent' || /^\d+(?:\.\d+)?$/u.test(value);
}

function isWebUrl(value: unknown) {
    if (typeof value !== 'string' || !/^https?:\/\//iu.test(value)) {
        return false;
    }
    try {
        const url = new URL(value);
        return url.username === '' && url.password === '';
    } catch {
        return false;
    }
}

function urlOf(input: unknown) {
    return typeof input === 'object' && input !== null && 'url' in input ? input.url : undefined;
}
