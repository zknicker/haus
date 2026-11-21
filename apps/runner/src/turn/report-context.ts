import { formatMemoryBlock, type RuleFile } from '@haus/agent-prompt';
import type { AgentStartCommand } from '@haus/api';
import type { RunnerLink } from '../run-context.ts';
import { contextSnapshot, type HarnessContext } from './context-snapshot.ts';
import type { RuntimeSession } from './runtime-driver.ts';
import type { AgentSessionRecord } from './session-file.ts';

export async function readHarnessContext(live: RuntimeSession, log: (line: string) => void) {
    try {
        return await live.contextUsage();
    } catch (error) {
        log(`Runner could not read the session context: ${String(error)}`);
        return null;
    }
}

export function reportContext(input: {
    composed: { readonly instructions: string; readonly skillListing: string };
    harness: HarnessContext | null;
    link: RunnerLink;
    memory: string | null;
    providerTokens: number | null;
    recorded: AgentSessionRecord;
    rules: readonly RuleFile[];
    start: Pick<AgentStartCommand, 'agentId' | 'modelId' | 'runId' | 'sessionGeneration'>;
}) {
    if (!input.harness) {
        return;
    }
    const snapshot = contextSnapshot({
        harness: input.harness,
        measured: {
            instructions: input.composed.instructions,
            memory: deliveredText(input),
            skillListing: input.composed.skillListing,
        },
        measuredAt: new Date().toISOString(),
        providerTokens: input.providerTokens,
        start: input.start,
    });
    if (snapshot) {
        input.link.send({ runId: input.start.runId, snapshot, type: 'agent-context' });
    }
}

function deliveredText(input: {
    memory: string | null;
    recorded: AgentSessionRecord;
    rules: readonly RuleFile[];
}) {
    const rules = input.rules.flatMap((file) =>
        file.content !== null && Object.hasOwn(input.recorded.deliveredRuleDigests, file.path)
            ? [file.content]
            : []
    );
    const memory =
        input.memory !== null && input.recorded.deliveredMemoryDigest !== null
            ? [formatMemoryBlock(input.memory)]
            : [];
    return [...rules, ...memory].join('\n\n');
}
