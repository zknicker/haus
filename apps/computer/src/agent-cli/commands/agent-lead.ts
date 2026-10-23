import {
    type Lead,
    leadClaimResultSchema,
    leadDoneInputSchema,
    leadListResponseSchema,
} from '@haus/api';
import * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import { requiredValue } from './agent-command-utils.ts';

interface LeadDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

const acknowledgedSchema = z.looseObject({});

export const LEAD_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus lead claim --topic "Why the Etsy payout was short"',
            'haus lead claim --topic "Unanswered shipping question" --message-id msg_abc123',
        ],
        flags: [
            {
                description: 'What you are chasing (up to 200 characters)',
                name: '--topic',
                valueName: '<text>',
            },
            {
                description: 'The message this lead came from',
                name: '--message-id',
                valueName: '<id>',
            },
        ],
        name: 'claim',
        notes: [
            'Claim a lead before researching it. A message another Agent claimed in the last 7 days is refused and names who holds it.',
            'Heartbeat runs only; in a regular turn use haus task claim. A message an Agent holds as a task is refused.',
        ],
        positionals: [],
        run: (args) => runLeadClaim(args, defaultDeps()),
        summary: 'Claim a lead so no other Agent chases it too',
        usage: 'haus lead claim --topic <text> [--message-id <id>]',
    },
    {
        examples: ['haus lead list'],
        flags: [],
        name: 'list',
        notes: ['Shows the team’s leads from the last 7 days with each holder’s finding.'],
        positionals: [],
        run: () => runLeadList(defaultDeps()),
        summary: 'List the team’s leads from the last 7 days',
        usage: 'haus lead list',
    },
    {
        examples: [
            'haus lead done --id led_abc123 --finding "Nothing wrong; the payout posted a day late."',
        ],
        flags: [
            { description: 'The lead id', name: '--id', valueName: '<id>' },
            {
                description: 'What you found (up to 1000 characters)',
                name: '--finding',
                valueName: '<text>',
            },
        ],
        name: 'done',
        positionals: [],
        run: (args) => runLeadDone(args, defaultDeps()),
        summary: 'Record what you found for a lead you claimed',
        usage: 'haus lead done --id <id> --finding <text>',
    },
];

export async function runLeadClaim(args: ParsedArgs, deps: LeadDeps): Promise<number> {
    const messageId = args.values['--message-id']?.trim();
    const result = await deps.client.request('/api/agent/leads', leadClaimResultSchema, {
        body: { ...(messageId ? { messageId } : {}), topic: requiredValue(args, '--topic') },
        method: 'POST',
    });
    deps.write(
        result.claimed
            ? `Claimed lead ${result.lead.id}: ${result.lead.topic}\n`
            : `Already claimed by @${result.heldBy.agentHandle} (lead ${result.leadId}).\n`
    );
    return 0;
}

export async function runLeadList(deps: LeadDeps): Promise<number> {
    const { leads } = await deps.client.request('/api/agent/leads', leadListResponseSchema);
    if (leads.length === 0) {
        deps.write('No leads in the last 7 days.\n');
        return 0;
    }
    deps.write(`${leads.map(leadLine).join('\n')}\n`);
    return 0;
}

export async function runLeadDone(args: ParsedArgs, deps: LeadDeps): Promise<number> {
    const id = requiredValue(args, '--id');
    const input = leadDoneInputSchema.safeParse({ finding: requiredValue(args, '--finding') });
    if (!input.success) {
        throw new AgentCliError('INVALID_ARG', '--finding must be 1–1000 characters.');
    }
    await deps.client.request(
        `/api/agent/leads/${encodeURIComponent(id)}/done`,
        acknowledgedSchema,
        { body: input.data, method: 'POST' }
    );
    deps.write(`Lead ${id} marked done.\n`);
    return 0;
}

function leadLine(lead: Lead): string {
    const state = lead.doneAt ? `done: ${lead.finding ?? 'no finding recorded'}` : 'open';
    return `${lead.id}  @${lead.agentHandle}  ${lead.topic}  [${state}]`;
}

function defaultDeps(): LeadDeps {
    return { client: createAgentApiClient(), write: (text) => process.stdout.write(text) };
}
