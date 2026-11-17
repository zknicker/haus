import { AgentCliError } from '../agent-error.ts';
import {
    findCloudAgentReportRun,
    renderCloudAgentReportText,
    renderCloudAgentWorkDetail,
    renderCloudAgentWorkList,
} from '../cloud-agent-render.ts';
import { agentCloudAgentListReceiptResponseSchema } from '../cloud-agent-work-response-schema.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { type CloudAgentDeps, defaultDeps } from './agent-cloud-agent-deps.ts';

export const INSPECT_COMMAND: SubCommand = {
    examples: [
        'haus cloud-agent inspect',
        'haus cloud-agent inspect --work caw_9f2c1a0b7d4e6f81',
        'haus cloud-agent inspect --work caw_9f2c1a0b7d4e6f81 --report',
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
    run: (args) => runCloudAgentInspect(args, defaultDeps()),
    summary: 'Inspect your cloud agent work and its recorded results',
    usage: 'haus cloud-agent inspect [--work <workId>] [--report [--run <runId>]]',
};

export async function runCloudAgentInspect(
    args: ParsedArgs,
    deps: CloudAgentDeps
): Promise<number> {
    const workId = args.values['--work']?.trim();
    const wantsReport = args.flags['--report'] === true;
    if (wantsReport && !workId) {
        throw new AgentCliError('INVALID_ARG', '--report only works alongside --work.', {
            nextAction: 'haus cloud-agent inspect --work <workId> --report',
        });
    }
    const { works } = await deps.client.request(
        '/api/agent/cloud-agents',
        agentCloudAgentListReceiptResponseSchema,
        { query: { workId } }
    );
    if (wantsReport && workId) {
        deps.write(renderReport(works, workId, args.values['--run']?.trim()));
        return 0;
    }
    deps.write(workId ? renderCloudAgentWorkDetail(works) : renderCloudAgentWorkList(works));
    return 0;
}

function renderReport(
    works: Parameters<typeof findCloudAgentReportRun>[0],
    workId: string,
    runId: string | undefined
): string {
    const run = findCloudAgentReportRun(works, workId, runId);
    if (!run) {
        throw new AgentCliError(
            'CLOUD_AGENT_REPORT_NOT_FOUND',
            runId
                ? `Run ${runId} on work ${workId} has no recorded report.`
                : `Work ${workId} has no Run with a recorded report.`,
            { nextAction: `haus cloud-agent inspect --work ${workId}` }
        );
    }
    return renderCloudAgentReportText(run);
}
