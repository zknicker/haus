import {
    type AgentGithubTriggerConfigInput,
    agentTriggerResultSchema,
    type TriggerKind,
    triggerKindSchema,
} from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { githubOnlyFlags, readGithubTriggerConfig } from './agent-trigger-github.ts';

// Which outside stimulus a Trigger listens to, and the kind-specific flags that
// configure it. A flag only another kind takes is refused, never ignored.

export type TriggerConfig =
    | { kind: 'webhook' }
    | { github: AgentGithubTriggerConfigInput; kind: 'github' };

/** `--kind` names the outside stimulus; absent means webhook. */
export function readKind(args: ParsedArgs): TriggerKind {
    const raw = args.values['--kind']?.trim();
    if (!raw) {
        return 'webhook';
    }
    const parsed = triggerKindSchema.safeParse(raw);
    if (!parsed.success) {
        throw new AgentCliError('INVALID_ARG', `--kind ${raw} is not a trigger kind.`, {
            nextAction: `Supported kinds: ${triggerKindSchema.options.join(', ')}.`,
        });
    }
    return parsed.data;
}

/** Whether any kind-specific flag is present, so an update replaces the configuration. */
export function hasConfigFlags(args: ParsedArgs): boolean {
    return githubOnlyFlags.some((flag) => args.values[flag] !== undefined);
}

/** Builds the kind's configuration from its flags; `verb` shapes the refusal. */
export function readTriggerConfig(
    args: ParsedArgs,
    kind: TriggerKind,
    verb: 'create' | 'update'
): TriggerConfig {
    switch (kind) {
        case 'webhook':
            refuseGithubFlags(args, verb);
            return { kind };
        case 'github':
            return { github: readGithubTriggerConfig(args), kind };
        default:
            return kind satisfies never;
    }
}

/** An update keeps the Trigger's kind, so the Server's view decides which flags apply. */
export async function readTriggerKind(client: AgentApiRequester, id: string): Promise<TriggerKind> {
    const { trigger } = await client.request(
        `/api/agent/triggers/${encodeURIComponent(id)}`,
        agentTriggerResultSchema,
        { method: 'GET' }
    );
    return trigger.kind;
}

function refuseGithubFlags(args: ParsedArgs, verb: 'create' | 'update') {
    const foreign = githubOnlyFlags.find((flag) => args.values[flag] !== undefined);
    if (!foreign) {
        return;
    }
    if (verb === 'update') {
        throw new AgentCliError('INVALID_ARG', `${foreign} does not apply to a webhook trigger.`, {
            nextAction: 'It configures github triggers only.',
        });
    }
    throw new AgentCliError('INVALID_ARG', `${foreign} needs --kind github.`);
}
