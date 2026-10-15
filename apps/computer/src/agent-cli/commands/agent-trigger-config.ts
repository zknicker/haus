import {
    type AgentGithubTriggerConfigInput,
    type AgentLinearTriggerConfigInput,
    agentTriggerResultSchema,
    type TriggerKind,
    triggerKindSchema,
} from '@haus/api';
import type { AgentApiRequester } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { githubOnlyFlags, readGithubTriggerConfig } from './agent-trigger-github.ts';
import { linearFlags, linearOnlyFlags, readLinearTriggerConfig } from './agent-trigger-linear.ts';

// Which outside stimulus a Trigger listens to, and the kind-specific flags that
// configure it. A flag only another kind takes is refused, never ignored.

export type TriggerConfig =
    | { kind: 'webhook' }
    | { github: AgentGithubTriggerConfigInput; kind: 'github' }
    | { kind: 'linear'; linear: AgentLinearTriggerConfigInput };

const flagsByKind: Record<TriggerKind, readonly string[]> = {
    github: githubOnlyFlags,
    linear: linearFlags,
    webhook: [],
};

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
    return [...githubOnlyFlags, ...linearOnlyFlags].some((flag) => args.values[flag] !== undefined);
}

/** Builds the kind's configuration from its flags; `verb` shapes the refusal. */
export function readTriggerConfig(
    args: ParsedArgs,
    kind: TriggerKind,
    verb: 'create' | 'update'
): TriggerConfig {
    refuseForeignFlags(args, kind, verb);
    switch (kind) {
        case 'webhook':
            return { kind };
        case 'github':
            return { github: readGithubTriggerConfig(args), kind };
        case 'linear':
            return { kind, linear: readLinearTriggerConfig(args) };
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

function refuseForeignFlags(args: ParsedArgs, kind: TriggerKind, verb: 'create' | 'update') {
    const own = new Set(flagsByKind[kind]);
    const foreign = [...githubOnlyFlags, ...linearOnlyFlags].find(
        (flag) => args.values[flag] !== undefined && !own.has(flag)
    );
    if (!foreign) {
        return;
    }
    const kinds = (['github', 'linear'] as const).filter((name) =>
        flagsByKind[name].includes(foreign)
    );
    if (verb === 'update') {
        throw new AgentCliError('INVALID_ARG', `${foreign} does not apply to a ${kind} trigger.`, {
            nextAction: `It configures ${kinds.join(' or ')} triggers only.`,
        });
    }
    throw new AgentCliError('INVALID_ARG', `${foreign} needs --kind ${kinds.join(' or --kind ')}.`);
}
