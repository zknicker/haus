import { agentComputerEntrySchema, agentComputerListResponseSchema } from '@haus/api';
import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import type { SubCommand } from '../subcommand.ts';

const computerListSchema = z.looseObject({
    ...agentComputerListResponseSchema.shape,
    computers: z.array(z.looseObject(agentComputerEntrySchema.shape)).max(200),
});
type ComputerList = z.infer<typeof computerListSchema>;
type ComputerEntry = ComputerList['computers'][number];

interface ComputerDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

const targetHint =
    'Target one with the `computer` field (its name or id) on a bash, shell, edit, view_image, or execute call. Without it, tools run on your Machine.';

export const COMPUTER_SUBCOMMANDS: SubCommand[] = [
    {
        examples: ['haus computer list'],
        flags: [],
        name: 'list',
        notes: [
            'Your tools run on a Computer only when its Agent access allows you. A desktop call also needs computer use on.',
        ],
        positionals: [],
        run: () => runComputerList(defaultDeps()),
        summary: 'List the Computers on this Server and which ones your tools can run on',
        usage: 'haus computer list',
    },
];

export async function runComputerList(deps: ComputerDeps) {
    const response = await deps.client.request('/api/agent/computers', computerListSchema);
    deps.write(renderComputerList(response));
    return 0;
}

export function renderComputerList(list: ComputerList) {
    if (list.computers.length === 0) {
        return 'No Computers are attached to this Server.\n';
    }
    return `${[...list.computers.map(computerLine), '', targetHint].join('\n')}\n`;
}

function computerLine(computer: ComputerEntry) {
    const marks = [
        computer.online ? 'online' : 'offline',
        ...(computer.operatingSystem ? [computer.operatingSystem] : []),
        accessMark(computer),
        ...(computer.computerUse ? ['computer use'] : []),
    ];
    return `${computer.name ?? 'Unnamed'} (${computer.computerId}) · ${marks.join(' · ')}`;
}

function accessMark(computer: ComputerEntry) {
    if (computer.machine) {
        return 'machine';
    }
    return computer.allowed ? 'allowed' : 'no access';
}

function defaultDeps() {
    return {
        client: createAgentApiClient(),
        write: (text: string) => process.stdout.write(text),
    } satisfies ComputerDeps;
}
