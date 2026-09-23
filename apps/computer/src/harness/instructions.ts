import { createHash } from 'node:crypto';
import { hostname, release, type } from 'node:os';
import computerPackage from '../../package.json' with { type: 'json' };
import { type AgentPromptRenderInput, renderAgentInstructions } from './managed-instructions.ts';

/**
 * Ported composition seam (Runtime's `agent-instructions.ts` +
 * `generateAgentInstructions`): every real Agent turn's system prompt is the
 * managed Haus operating contract, fingerprinted. The Computer composes this itself — the Server never
 * ships prompt text — so every cold start delivers the full CLI-only Haus
 * collaboration contract.
 *
 * Boundary adaptation: host facts (hostname/OS/runtime version) are derived on
 * the Computer; Server-owned Agent facts (name, description, web access, home
 * timezone) arrive on the start command because the Computer cannot know them.
 */
export interface AgentInstructionFacts {
    agentId: string;
    agentName: string;
    homeTimezone: string;
    initialRole: string | null;
    webAccess: 'fetch-only' | 'search' | 'search-only' | null;
    workspacePath: string;
}

export interface ComposedInstructions {
    fingerprint: string;
    instructions: string;
}

export function composeAgentInstructions(facts: AgentInstructionFacts): ComposedInstructions {
    const render: AgentPromptRenderInput = {
        agentId: facts.agentId,
        agentName: facts.agentName,
        homeTimezone: facts.homeTimezone,
        hostname: hostname(),
        initialRole: facts.initialRole,
        os: `${type()} ${release()}`,
        runtimeVersion: process.env.HAUS_COMPUTER_PRODUCT_VERSION ?? computerPackage.version,
        webAccess: facts.webAccess,
        workspacePath: facts.workspacePath,
    };
    const instructions = renderAgentInstructions(render);
    const fingerprint = createHash('sha256').update(instructions).digest('hex');
    return { fingerprint, instructions };
}
