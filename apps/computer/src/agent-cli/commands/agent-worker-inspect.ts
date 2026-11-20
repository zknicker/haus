import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    findWorkerReportTurn,
    renderWorkerDetail,
    renderWorkerList,
    renderWorkerReportText,
} from '../worker-render.ts';
import { agentWorkerListReceiptResponseSchema } from '../worker-response-schema.ts';
import { type WorkerDeps, defaultDeps } from './agent-worker-deps.ts';

export const INSPECT_COMMAND: SubCommand = {
    examples: [
        'haus worker inspect',
        'haus worker inspect --worker wkr_9f2c1a0b7d4e6f81',
        'haus worker inspect --worker wkr_9f2c1a0b7d4e6f81 --report',
    ],
    flags: [
        {
            description: 'The Worker to inspect; omit to list your Workers',
            name: '--worker',
            valueName: '<workerId>',
        },
        {
            description: "Print one turn's full provider result instead of the JSON detail",
            name: '--report',
        },
        {
            description: 'With --report, the turn to show; omit for the newest with a result',
            name: '--turn',
            valueName: '<turnId>',
        },
    ],
    name: 'inspect',
    positionals: [],
    run: (args) => runWorkerInspect(args, defaultDeps()),
    summary: 'List your Workers, or show one with its turns, inputs, reports, and pull requests',
    usage: 'haus worker inspect [--worker <workerId> [--report [--turn <turnId>]]]',
};

export async function runWorkerInspect(args: ParsedArgs, deps: WorkerDeps) {
    const workerId = args.values['--worker']?.trim();
    const wantsReport = args.flags['--report'] === true;
    if (wantsReport && !workerId) {
        throw new AgentCliError('INVALID_ARG', '--report only works alongside --worker.', {
            nextAction: 'haus worker inspect --worker <workerId> --report',
        });
    }
    const { workers } = await deps.client.request(
        '/api/agent/workers',
        agentWorkerListReceiptResponseSchema,
        { query: { workerId } }
    );
    if (wantsReport && workerId) {
        deps.write(renderReport(workers, workerId, args.values['--turn']?.trim()));
        return 0;
    }
    deps.write(workerId ? renderWorkerDetail(workers) : renderWorkerList(workers));
    return 0;
}

function renderReport(
    workers: Parameters<typeof findWorkerReportTurn>[0],
    workerId: string,
    turnId: string | undefined
) {
    const turn = findWorkerReportTurn(workers, workerId, turnId);
    if (!turn) {
        throw new AgentCliError(
            'WORKER_REPORT_NOT_FOUND',
            turnId
                ? `Turn ${turnId} of Worker ${workerId} has no recorded provider result.`
                : `Worker ${workerId} has no turn with a recorded provider result.`,
            { nextAction: `haus worker inspect --worker ${workerId}` }
        );
    }
    return renderWorkerReportText(turn);
}
