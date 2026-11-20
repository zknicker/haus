import { AgentApiClient } from '../agent-cli/agent-api-client.ts';
import { AgentCliError, renderAgentCliError } from '../agent-cli/agent-error.ts';
import { UsageError } from '../agent-cli/parse.ts';
import { readAgentStdin } from '../agent-cli/stdin.ts';
import { dispatchSubcommand, type SubCommand } from '../agent-cli/subcommand.ts';
import { errorBlock } from '../agent-cli/ui.ts';
import { driveViewCommand } from './worker-drive.ts';
import { reportCommand, type WorkerCliDeps } from './worker-report.ts';

type Environment = Record<string, string | undefined>;

export function workerCommandGroups(deps: () => WorkerCliDeps & { fetch: typeof fetch }) {
    return {
        drive: [driveViewCommand(deps)],
        worker: [reportCommand(deps)],
    } satisfies Record<string, SubCommand[]>;
}

export async function runWorkerCli(
    argv: string[],
    deps: () => WorkerCliDeps & { fetch: typeof fetch } = () => processDeps(process.env)
) {
    const groups = workerCommandGroups(deps);
    const [group, ...rest] = argv;
    if (!group || group === '--help' || group === '-h' || group === 'help') {
        process.stdout.write(helpText());
        return 0;
    }
    const subcommands = groups[group as keyof typeof groups];
    if (!subcommands) {
        process.stderr.write(
            `${errorBlock(
                `'haus ${group}' is not available to a Worker.`,
                'A Worker records its report with haus worker report and reads Drive with haus drive view.'
            )}\n`
        );
        return 2;
    }
    try {
        return await dispatchSubcommand(group, subcommands, rest);
    } catch (error) {
        if (error instanceof UsageError) {
            process.stderr.write(`${errorBlock(error.message)}\n`);
            return 2;
        }
        process.stderr.write(
            error instanceof AgentCliError
                ? renderAgentCliError(error)
                : `${errorBlock(error instanceof Error ? error.message : String(error))}\n`
        );
        return 1;
    }
}

export function processDeps(environment: Environment) {
    const serverUrl = environment.HAUS_SERVER_URL;
    const token = environment.HAUS_WORKER_TOKEN;
    if (!(serverUrl && token)) {
        throw new AgentCliError(
            'MISSING_TOKEN',
            'This shell has no Worker credential. Only a Worker turn runs haus here.'
        );
    }
    return {
        client: new AgentApiClient({ serverUrl, token }),
        fetch,
        readStdin: readAgentStdin,
        reportFile: environment.HAUS_WORKER_REPORT_FILE ?? null,
        stdinIsTty: process.stdin.isTTY === true,
        write: (output: string | Uint8Array) => process.stdout.write(output),
    } satisfies WorkerCliDeps & { fetch: typeof fetch };
}

function helpText() {
    return [
        'Haus Worker CLI',
        '',
        'Commands:',
        '  worker       report',
        '  drive        view',
        '',
        "Run 'haus <command> --help' for command help.",
        '',
    ].join('\n');
}
