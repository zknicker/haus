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
            valueName: '<workId>',
        },
        {
            description: "Print one Run's full report instead of the JSON detail; needs --work",
            name: '--report',
        },
        {
            description: 'With --report, the Run to show; omit for the newest with a report',
            name: '--run',
            valueName: '<runId>',
        },
    ],
    name: 'inspect',
    positionals: [],
    run: (args) => runWorkerInspect(args, defaultDeps()),
    summary: 'Inspect your Worker and its recorded results',
    usage: 'haus worker inspect [--work <workId>] [--report [--run <runId>]]',
};

export async function runWorkerInspect(args: ParsedArgs, deps: WorkerDeps): Promise<number> {
    const workId = args.values['--work']?.trim();
    const wantsReport = args.flags['--report'] === true;
    if (wantsReport && !workId) {
        throw new AgentCliError('INVALID_ARG', '--report only works alongside --work.', {
            nextAction: 'haus worker inspect --work <workId> --report',
        });
    }
    const { works } = await deps.client.request(
        '/api/agent/workers',
        agentWorkerListReceiptResponseSchema,
        { query: { workId } }
    );
    if (wantsReport && workId) {
        deps.write(renderReport(works, workId, args.values['--run']?.trim()));
        return 0;
    }
    deps.write(workId ? renderWorkerDetail(works) : renderWorkerList(works));
    return 0;
}

function renderReport(
    works: Parameters<typeof findWorkerReportRun>[0],
    workId: string,
    runId: string | undefined
): string {
    const run = findWorkerReportRun(works, workId, runId);
    if (!run) {
        throw new AgentCliError(
            'WORKER_REPORT_NOT_FOUND',
            runId
                ? `Run ${runId} on work ${workId} has no recorded report.`
                : `Work ${workId} has no Run with a recorded report.`,
            { nextAction: `haus worker inspect --work ${workId}` }
        );
    }
    return renderWorkerReportText(run);
}
