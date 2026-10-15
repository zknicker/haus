import { readFile } from 'node:fs/promises';
import {
    agentTriggerResultSchema,
    agentTriggerUpdateInputSchema,
    githubTriggerPreviewInputSchema,
    githubTriggerPreviewResultSchema,
} from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { TriggerDeps } from './agent-trigger-actions.ts';
import { githubOnlyFlags, readGithubTriggerConfig } from './agent-trigger-github.ts';
import { describeTrigger } from './agent-trigger-view.ts';

export async function runTriggerUpdate(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireId(args);
    const hasGithub = githubOnlyFlags.some((flag) => args.values[flag] !== undefined);
    const input = agentTriggerUpdateInputSchema.safeParse({
        ...(args.values['--title'] === undefined ? {} : { title: args.values['--title'] }),
        ...(args.values['--instruction'] === undefined
            ? {}
            : { instruction: args.values['--instruction'] || null }),
        ...(hasGithub ? { github: readGithubTriggerConfig(args) } : {}),
    });
    if (!input.success) {
        throw new AgentCliError('INVALID_ARG', input.error.issues[0]?.message ?? 'Invalid edit.');
    }
    const result = await deps.client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}`,
        agentTriggerResultSchema,
        { body: input.data, method: 'PATCH' }
    );
    deps.write(`Updated. ${describeTrigger(result.trigger)}\n`);
    return 0;
}

export async function runTriggerPreview(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireId(args);
    const path = args.values['--payload-file'];
    if (!path) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --payload-file with a GitHub webhook JSON file.'
        );
    }
    let payload: unknown;
    try {
        const contents = await readFile(path, 'utf8');
        if (Buffer.byteLength(contents) > 60_000) {
            throw new Error('Payload too large.');
        }
        payload = JSON.parse(contents);
    } catch {
        throw new AgentCliError(
            'INVALID_ARG',
            'The payload file must contain JSON under 60,000 bytes.'
        );
    }
    const input = githubTriggerPreviewInputSchema.safeParse({
        event: args.values['--event'],
        payload,
    });
    if (!input.success) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide a supported --event and a webhook JSON object.'
        );
    }
    const result = await deps.client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}/preview`,
        githubTriggerPreviewResultSchema,
        { body: input.data, method: 'POST' }
    );
    deps.write(
        `${JSON.stringify(result, null, 2)}\nSelection preview only; no fire recorded or Agent woken. Trigger status and connection readiness are shown by haus trigger show.\n`
    );
    return 0;
}

function requireId(args: ParsedArgs): string {
    const id = args.values['--id']?.trim();
    if (!id) {
        throw new AgentCliError('INVALID_ARG', 'Provide --id from haus trigger list.');
    }
    return id;
}
