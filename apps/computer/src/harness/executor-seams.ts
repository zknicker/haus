import type { HarnessV1 } from '@ai-sdk/harness';
import type { HarnessAgent } from '@ai-sdk/harness/agent';
import type { ToolSet } from '@ai-sdk/provider-utils';
import { refreshHarnessBootstrap } from './bootstrap-refresh.ts';
import { createHarnessAgent } from './create-agent.ts';
import type { HarnessTurnInput } from './executor.ts';

// Tests inject a fake Agent at this construction seam.
export type HarnessAgentFactory = (
    input: HarnessTurnInput,
    options: { harness: HarnessV1<ToolSet>; instructions: string }
) => Pick<HarnessAgent, 'createSession' | 'stream'>;

let harnessAgentFactory: HarnessAgentFactory = createHarnessAgent;

export function currentHarnessAgentFactory(): HarnessAgentFactory {
    return harnessAgentFactory;
}

export function setHarnessAgentFactoryForTesting(factory: HarnessAgentFactory) {
    const previous = harnessAgentFactory;
    harnessAgentFactory = factory;
    return () => {
        harnessAgentFactory = previous;
    };
}

type HarnessBootstrapRefresh = typeof refreshHarnessBootstrap;
let harnessBootstrapRefresh: HarnessBootstrapRefresh = refreshHarnessBootstrap;

export function currentHarnessBootstrapRefresh(): HarnessBootstrapRefresh {
    return harnessBootstrapRefresh;
}

export function setHarnessBootstrapRefreshForTesting(refresh: HarnessBootstrapRefresh) {
    const previous = harnessBootstrapRefresh;
    harnessBootstrapRefresh = refresh;
    return () => {
        harnessBootstrapRefresh = previous;
    };
}
