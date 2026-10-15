import { readFile } from 'node:fs/promises';
import {
    agentTriggerResultSchema,
    agentTriggerUpdateInputSchema,
    githubTriggerPreviewInputSchema,
    githubTriggerPreviewResultSchema,
    linearTriggerPreviewInputSchema,
    linearTriggerPreviewResultSchema,
} from '@haus/api';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import type { TriggerDeps } from './agent-trigger-actions.ts';
import { hasConfigFlags, readTriggerConfig, readTriggerKind } from './agent-trigger-config.ts';
import { describeTrigger } from './agent-trigger-view.ts';

export async function runTriggerUpdate(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireId(args);
    const config = hasConfigFlags(args)
        ? await readTriggerConfig(
              args,
              await readTriggerKind(deps.client, id),
              deps.client,
              'update'
          )
        : null;
    const input = agentTriggerUpdateInputSchema.safeParse({
        ...(args.values['--title'] === undefined ? {} : { title: args.values['--title'] }),
        ...(args.values['--instruction'] === undefined
            ? {}
            : { instruction: args.values['--instruction'] || null }),
        ...(config?.kind === 'github' ? { github: config.github } : {}),
        ...(config?.kind === 'linear' ? { linear: config.linear } : {}),
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

/**
 * A GitHub sample names its event with `--event`; a Linear body names its own
 * (`type`), so a preview without `--event` is a Linear preview.
 */
export async function runTriggerPreview(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireId(args);
    const payload = await readPayload(args.values['--payload-file']);
    const route = `/api/agent/triggers/${encodeURIComponent(id)}/preview`;
    const event = args.values['--event'];
    if (event === undefined) {
        const input = linearTriggerPreviewInputSchema.safeParse({ payload });
        if (!input.success) {
            throw new AgentCliError('INVALID_ARG', 'Provide a Linear webhook JSON object.', {
                nextAction: 'For a GitHub trigger, also pass --event with the GitHub event name.',
            });
        }
        const result = await deps.client.request(route, linearTriggerPreviewResultSchema, {
            body: input.data,
            method: 'POST',
        });
        deps.write(`${JSON.stringify(result, null, 2)}\n${previewNote}`);
        return 0;
    }
    const input = githubTriggerPreviewInputSchema.safeParse({ event, payload });
    if (!input.success) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide a supported --event and a webhook JSON object.'
        );
    }
    const result = await deps.client.request(route, githubTriggerPreviewResultSchema, {
        body: input.data,
        method: 'POST',
    });
    deps.write(`${JSON.stringify(result, null, 2)}\n${previewNote}`);
    return 0;
}

const previewNote =
    'Selection preview only; no fire recorded or Agent woken. Trigger status and connection readiness are shown by haus trigger show.\n';

async function readPayload(path: string | undefined): Promise<unknown> {
    if (!path) {
        throw new AgentCliError('INVALID_ARG', 'Provide --payload-file with a webhook JSON file.');
    }
    try {
        const contents = await readFile(path, 'utf8');
        if (Buffer.byteLength(contents) > 60_000) {
            throw new Error('Payload too large.');
        }
        return JSON.parse(contents);
    } catch {
        throw new AgentCliError(
            'INVALID_ARG',
            'The payload file must contain JSON under 60,000 bytes.'
        );
    }
}

function requireId(args: ParsedArgs): string {
    const id = args.values['--id']?.trim();
    if (!id) {
        throw new AgentCliError('INVALID_ARG', 'Provide --id from haus trigger list.');
    }
    return id;
}
