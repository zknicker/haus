import { type AgentTriggerSecretResult, agentTriggerSecretResultSchema } from '@haus/api';
import { AgentApiTransportError } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import {
    closePrivateSecretSink,
    type PrivateSecretSink,
    preparePrivateSecretSink,
    writePrivateSecretSink,
} from '../private-secret-sink.ts';
import type { TriggerDeps } from './agent-trigger-actions.ts';
import { describeTrigger } from './agent-trigger-view.ts';

// The two verbs that mint a webhook secret. The secret goes only to a newly
// created mode-0600 file named by --output (Raft's rotate-secret pattern): the
// file is created before the Server is contacted, so a missing or taken path
// fails with nothing minted, and no stdout, stderr, or error text ever carries
// the secret. The Server's own `curl` field embeds the secret, so it is never
// printed either; the receipt builds a test command that reads the file.

export async function createWebhookTrigger(
    args: ParsedArgs,
    deps: TriggerDeps,
    body: Record<string, unknown>
): Promise<number> {
    const sink = preparePrivateSecretSink(args.values['--output']);
    const response = await requestIntoSink(sink, 'create', () =>
        deps.client.request('/api/agent/triggers', agentTriggerSecretResultSchema, {
            body,
            method: 'POST',
        })
    );
    writePrivateSecretSink(sink, response.secret);
    deps.write(`Created. ${renderSecretReceipt(response, sink.filePath)}`);
    return 0;
}

export async function rotateWebhookSecret(
    id: string,
    args: ParsedArgs,
    deps: TriggerDeps
): Promise<number> {
    const sink = preparePrivateSecretSink(args.values['--output']);
    const response = await requestIntoSink(sink, 'rotate', () =>
        deps.client.request(
            `/api/agent/triggers/${encodeURIComponent(id)}/rotate`,
            agentTriggerSecretResultSchema,
            { method: 'POST' }
        )
    );
    writePrivateSecretSink(sink, response.secret);
    deps.write(
        `Rotated. The previous secret no longer works. ${renderSecretReceipt(response, sink.filePath)}`
    );
    return 0;
}

/** Keeps the Server's refusal, adding what happened to the file and whether anything was minted. */
async function requestIntoSink(
    sink: PrivateSecretSink,
    verb: 'create' | 'rotate',
    send: () => Promise<AgentTriggerSecretResult>
): Promise<AgentTriggerSecretResult> {
    try {
        return await send();
    } catch (cause) {
        closePrivateSecretSink(sink);
        if (!(cause instanceof AgentCliError)) {
            throw cause;
        }
        const minted =
            cause instanceof AgentApiTransportError
                ? `The Server may have ${verb === 'create' ? 'created the trigger' : 'rotated the secret'} anyway; check haus trigger list before retrying.`
                : `Nothing was ${verb === 'create' ? 'created' : 'rotated'}.`;
        const cleanup = `The empty file at ${sink.filePath} remains; trash it before retrying.`;
        throw new AgentCliError(cause.code, cause.message, {
            ...cause.options,
            nextAction: [minted, cleanup, cause.options.nextAction].filter(Boolean).join(' '),
        });
    }
}

function renderSecretReceipt(result: AgentTriggerSecretResult, filePath: string): string {
    const { trigger, url } = result;
    return [
        describeTrigger(trigger),
        `Secret: written to ${filePath} (new file, mode 0600). It is not shown anywhere else; haus trigger rotate --id ${trigger.id} --output <new-path> replaces it.`,
        'Install it: pass the file to the destination’s secret store or config, then trash the file. Never post the secret in any chat, DM included. To hand it to a person instead, share only the URL and have them reveal a fresh secret in the App (Agent profile → Automations → Rotate).',
        `Test from your own run only; this reads the file and prints only the status (202 means the fire landed): ${testCommand(url, filePath)}`,
        `Then confirm the fire with haus trigger log --id ${trigger.id}.`,
        '',
    ].join('\n');
}

function testCommand(url: string, filePath: string): string {
    return `curl -sS -o /dev/null -w '%{http_code}\\n' -X POST ${shellQuote(url)} -H "Authorization: Bearer $(cat ${shellQuote(filePath)})" -H 'Content-Type: application/json' -d '{"hello":"world"}'`;
}

function shellQuote(value: string): string {
    return `'${value.replaceAll("'", `'\\''`)}'`;
}
