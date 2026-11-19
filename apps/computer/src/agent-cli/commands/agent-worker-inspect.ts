import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    findWorkerReportRun,
    renderWorkerReportText,
    renderWorkerDetail,
    renderWorkerList,
} from '../worker-render.ts';
import { agentWorkerListReceiptResponseSchema } from '../worker-response-schema.ts';
import { type WorkerDeps, defaultDeps } from './agent-worker-deps.ts';

export const INSPECT_COMMAND: SubCommand = {
    examples: [
        'haus worker inspect',
        'haus worker inspect --work caw_9f2c1a0b7d4e6f81',
        'haus worker inspect --work caw_9f2c1a0b7d4e6f81 --report',
    ],
    flags: [
        {
            description: 'Work to inspect; omit to list your work',
            name: '--work',
            valueName: '<workerId>',
        },
        {
            description: "Print one Run's full report instead of the JSON detail; needs --work",
            name: '--report',
        },
        {
            description: 'With --report, the Run to show; omit for the newest with a report',
            name: '--run',
            valueName: '<turnId>',
        },
    ],
    name: 'inspect',
    positionals: [],
    run: (args) => runWorkerInspect(args, defaultDeps()),
    summary: 'Inspect your Worker and its recorded results',
    usage: 'haus worker inspect [--work <workerId>] [--report [--run <turnId>]]',
};

export async function runWorkerInspect(args: ParsedArgs, deps: WorkerDeps): Promise<number> {
    const workerId = args.values['--work']?.trim();
    const wantsReport = args.flags['--report'] === true;
    if (wantsReport && !workerId) {
        throw new AgentCliError('INVALID_ARG', '--report only workers alongside --work.', {
            nextAction: 'haus worker inspect --work <workerId> --report',
        });
    }
    const { workers } = await deps.client.request(
        '/api/agent/workers',
        agentWorkerListReceiptResponseSchema,
        { query: { workerId } }
    );
    if (wantsReport && workerId) {
        deps.write(renderReport(workers, workerId, args.values['--run']?.trim()));
        return 0;
    }
    deps.write(workerId ? renderWorkerDetail(workers) : renderWorkerList(workers));
    return 0;
}

function renderReport(
    workers: Parameters<typeof findWorkerReportRun>[0],
    workerId: string,
    turnId: string | undefined
): string {
    const run = findWorkerReportRun(workers, workerId, turnId);
    if (!run) {
        throw new AgentCliError(
            'WORKER_REPORT_NOT_FOUND',
            turnId
                ? `Run ${turnId} on work ${workerId} has no recorded report.`
                : `Work ${workerId} has no Run with a recorded report.`,
            { nextAction: `haus worker inspect --work ${workerId}` }
        );
    }
    return renderWorkerReportText(run);
}
