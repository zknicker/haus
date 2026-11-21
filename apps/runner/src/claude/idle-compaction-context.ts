import type { AgentStartCommand } from '@haus/api';
import type { RunnerLink } from '../run-context.ts';
import { contextSnapshot, type HarnessContext } from '../turn/context-snapshot.ts';

export interface CompactedContextBasis {
    readonly instructions: string;
    readonly skillListing: string;
    readonly start: Pick<AgentStartCommand, 'agentId' | 'modelId' | 'runId' | 'sessionGeneration'>;
}

export async function reportCompactedContext(input: {
    basis: CompactedContextBasis;
    link: RunnerLink;
    log: (line: string) => void;
    usage: () => Promise<HarnessContext>;
}) {
    const { basis } = input;
    try {
        const snapshot = contextSnapshot({
            harness: await input.usage(),
            measured: {
                instructions: basis.instructions,
                memory: '',
                skillListing: basis.skillListing,
            },
            measuredAt: new Date().toISOString(),
            providerTokens: null,
            start: basis.start,
        });
        if (snapshot) {
            input.link.send({ runId: basis.start.runId, snapshot, type: 'agent-context' });
        }
    } catch (error) {
        input.log(
            `Runner could not report ${basis.start.agentId}'s context after an idle compaction: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}
