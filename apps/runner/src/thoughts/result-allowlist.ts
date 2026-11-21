import { readShellCommand } from '@haus/computer/src/harness/haus-cli-command.ts';

export interface ToolOperation {
    readonly input: unknown;
    readonly toolName: string;
}

export function admitsResult(operation: ToolOperation) {
    if (webSearchTools.has(operation.toolName)) {
        return true;
    }
    return shellTools.has(operation.toolName) && isTestRun(readShellCommand(operation.input));
}

const webSearchTools = new Set(['web_search', 'webSearch']);

const shellTools = new Set(['bash', 'shell']);

function isTestRun(command: string | null) {
    if (command === null || refusedCharacters.test(command)) {
        return false;
    }
    const words = command.trim().split(/ +/u);
    const runner = testRunners.find((candidate) =>
        candidate.every((word, index) => words[index] === word)
    );
    return runner !== undefined && words.slice(runner.length).every((word) => testFlags.has(word));
}

const refusedCharacters = /[\n\r\t;&|$`<>()*?[\]{}~'"\\]/u;

const testRunners: readonly (readonly string[])[] = [
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
];

const testFlags = new Set(['-q', '--quiet', '-v', '--verbose', '--bail', '-x']);
