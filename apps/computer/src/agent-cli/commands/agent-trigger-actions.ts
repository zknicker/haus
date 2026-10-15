import {
    type AgentTrigger,
    agentTriggerDeleteResultSchema,
    agentTriggerListSchema,
    agentTriggerLogSchema,
    agentTriggerResultSchema,
    agentTriggerSecretResultSchema,
    type TriggerFire,
    type TriggerFireDetail,
    triggerInstructionMaxBytes,
    triggerLogLimitMax,
    triggerTitleMaxLength,
} from '@haus/api';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { formatUtcTime } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';
import { readKind, readTriggerConfig } from './agent-trigger-config.ts';
import { linearProblemFix } from './agent-trigger-linear-view.ts';
import { describeTrigger, problemFix } from './agent-trigger-view.ts';

// Request and render logic behind `haus trigger`. Trigger mutations are
// deliberately not idempotent (no command ledger on the Server), so no request
// here is ever retried on its own the way a reminder command is.

export interface TriggerDeps {
    client: AgentApiRequester;
    write(text: string): void;
}

export async function runTriggerCreate(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const title = requireTitle(args);
    const messageId = args.values['--message-id']?.trim();
    if (!messageId) {
        throw new AgentCliError('INVALID_ARG', 'Provide --message-id with the anchor message.', {
            nextAction: 'Use the msg= id from the message that asked for this trigger.',
        });
    }
    const instruction = readInstruction(args);
    const config = readTriggerConfig(args, readKind(args), 'create');
    const body = { messageId, title, ...(instruction ? { instruction } : {}), ...config };
    if (config.kind === 'webhook') {
        const response = await deps.client.request(
            '/api/agent/triggers',
            agentTriggerSecretResultSchema,
            { body, method: 'POST' }
        );
        deps.write(renderSecret(response));
        return 0;
    }
    const response = await deps.client.request('/api/agent/triggers', agentTriggerResultSchema, {
        body,
        method: 'POST',
    });
    const source = config.kind === 'github' ? 'GitHub' : 'Linear';
    deps.write(
        `Created. ${describeTrigger(response.trigger)}\nNo URL or secret: ${source} deliveries reach you directly. Check fires with haus trigger log --id ${response.trigger.id}.\n`
    );
    return 0;
}

export async function runTriggerList(_args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const response = await deps.client.request('/api/agent/triggers', agentTriggerListSchema, {
        method: 'GET',
    });
    if (response.triggers.length === 0) {
        deps.write(
            'No triggers. Create one with haus trigger create when an outside event should reach you.\n'
        );
        return 0;
    }
    deps.write(`${response.triggers.map((row) => describeTrigger(row)).join('\n')}\n`);
    return 0;
}

export async function runTriggerShow(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireTriggerId(args);
    const response = await deps.client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}`,
        agentTriggerResultSchema,
        { method: 'GET' }
    );
    const { trigger } = response;
    const lines = [describeTrigger(trigger)];
    if (trigger.instruction) {
        lines.push(`Instruction: ${trigger.instruction}`);
    }
    if (trigger.kind === 'github' && trigger.github.problem) {
        lines.push(`Not firing. ${problemFix(trigger.github.problem)}`);
    }
    if (trigger.kind === 'linear' && trigger.linear.problem) {
        lines.push(`Not firing. ${linearProblemFix(trigger.linear.problem)}`);
    }
    deps.write(`${lines.join('\n')}\n`);
    return 0;
}

export async function runTriggerStatus(
    args: ParsedArgs,
    deps: TriggerDeps,
    action: 'disable' | 'enable'
): Promise<number> {
    const id = requireTriggerId(args);
    const response = await deps.client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}/${action}`,
        agentTriggerResultSchema,
        { method: 'POST' }
    );
    const label = action === 'enable' ? 'Armed' : 'Disabled';
    deps.write(`${label}. ${describeTrigger(response.trigger)}\n`);
    return 0;
}

export async function runTriggerRotate(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireTriggerId(args);
    const response = await deps.client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}/rotate`,
        agentTriggerSecretResultSchema,
        { method: 'POST' }
    );
    deps.write(`Rotated. The previous secret no longer works.\n${renderSecret(response)}`);
    return 0;
}

export async function runTriggerDelete(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireTriggerId(args);
    const response = await deps.client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}`,
        agentTriggerDeleteResultSchema,
        { method: 'DELETE' }
    );
    deps.write(
        `Removed trigger ${response.id}. Recent fire history stays in the Agent profile for 30 days; provenance marks stay with their messages.\n`
    );
    return 0;
}

export async function runTriggerLog(args: ParsedArgs, deps: TriggerDeps): Promise<number> {
    const id = requireTriggerId(args);
    const fireId = args.values['--fire']?.trim();
    const limit = readLimit(args);
    const response = await deps.client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}/log`,
        agentTriggerLogSchema,
        { method: 'GET', query: { fire: fireId, limit } }
    );
    if (response.kind === 'fire') {
        deps.write(renderFireDetail(response.fire));
        return 0;
    }
    const fires = response.fires;
    if (fires.length === 0) {
        deps.write(`No fires recorded for ${id} yet.\n`);
        return 0;
    }
    const lines = fires.map((fire) => describeFire(fire));
    deps.write(
        `${lines.join('\n')}\nRead one payload: haus trigger log --id ${id} --fire <fireId>\n`
    );
    return 0;
}

/** The only two responses that ever carry a secret; it is never readable again. */
function renderSecret(result: {
    curl: string;
    secret: string;
    trigger: AgentTrigger;
    url: string;
}): string {
    return [
        describeTrigger(result.trigger),
        `Secret: ${result.secret}`,
        `Shown once and never again — haus trigger rotate --id ${result.trigger.id} replaces it.`,
        'Never post the secret in any chat, DM included. Install it at the destination with a tool, or share only the URL and have the requester reveal a fresh secret in the App (Agent profile → Automations → Rotate).',
        `Test it from your own run only: ${result.curl}`,
        '',
    ].join('\n');
}

function describeFire(fire: TriggerFire): string {
    const dedupe = fire.dedupeKey ? ` dedupe=${fire.dedupeKey}` : '';
    return `${formatUtcTime(fire.receivedAt)} ${fire.id} ${fire.payloadBytes}B${dedupe}`;
}

/** Metadata, a blank line, then the payload exactly as the Server stored it. */
function renderFireDetail(fire: TriggerFireDetail): string {
    const contentType = fire.contentType ? ` type=${fire.contentType}` : '';
    const payload = fire.payload.endsWith('\n') ? fire.payload : `${fire.payload}\n`;
    return `${describeFire(fire)}${contentType}\n\n${payload}`;
}

function requireTitle(args: ParsedArgs): string {
    const title = args.values['--title']?.trim();
    if (!title) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --title with what the outside event means.'
        );
    }
    if (title.length > triggerTitleMaxLength) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--title is ${title.length} characters; the limit is ${triggerTitleMaxLength}.`,
            { nextAction: 'Shorten the title and put the detail in --instruction.' }
        );
    }
    return title;
}

function readInstruction(args: ParsedArgs): string | undefined {
    const instruction = args.values['--instruction']?.trim();
    if (!instruction) {
        return undefined;
    }
    const bytes = Buffer.byteLength(instruction);
    if (bytes > triggerInstructionMaxBytes) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--instruction is ${bytes} bytes; the limit is ${triggerInstructionMaxBytes}.`,
            { nextAction: 'Keep the standing instruction short; leave detail in the anchor chat.' }
        );
    }
    return instruction;
}

/** `--limit` for the fire history. Absent means the Server default of 50. */
function readLimit(args: ParsedArgs): number | undefined {
    const raw = args.values['--limit']?.trim();
    if (!raw) {
        return undefined;
    }
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > triggerLogLimitMax) {
        throw new AgentCliError(
            'INVALID_ARG',
            `--limit must be a whole number between 1 and ${triggerLogLimitMax}.`,
            { nextAction: 'Leave --limit off to read the most recent 50 fires.' }
        );
    }
    return limit;
}

function requireTriggerId(args: ParsedArgs): string {
    const id = args.values['--id']?.trim();
    if (!id) {
        throw new AgentCliError('INVALID_ARG', 'Provide --id with the trigger id.', {
            nextAction: 'Run haus trigger list to see your triggers and their ids.',
        });
    }
    return id;
}

export function defaultTriggerDeps(): TriggerDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
