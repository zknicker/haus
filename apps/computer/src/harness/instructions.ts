import { createHash } from 'node:crypto';
import { hostname, release, type } from 'node:os';
import type { ConnectionChipKind } from '@haus/api';
import computerPackage from '../../package.json' with { type: 'json' };
import { supportsSubagents } from '../runtime/runtime-subagents.ts';
import { type AgentPromptRenderInput, renderAgentInstructions } from './managed-instructions.ts';

/**
 * Ported composition seam (Runtime's `agent-instructions.ts` +
 * `generateAgentInstructions`): every real Agent turn's system prompt is the
 * managed Haus operating contract, fingerprinted. The Computer composes this itself — the Server never
 * ships prompt text — so every cold start delivers the full CLI-only Haus
 * collaboration contract.
 *
 * Boundary adaptation: host facts (hostname/OS/runtime version) are derived on
 * the Computer; Server-owned Agent facts (name, description, conversation style,
 * signature emoji, home timezone, connection chips) arrive on the start command because the Computer cannot know them.
 */
export interface AgentInstructionFacts {
    agentId: string;
    agentName: string;
    connectionChips?: readonly ConnectionChipKind[];
    conversationStyle?: string | null;
    homeTimezone: string;
    initialRole: string | null;
    /** Selects runtime-conditional sections such as sub-agent delegation. */
    runtimeId: string;
    signatureEmoji?: string | null;
    workspacePath: string;
}

export interface ComposedInstructions {
    /** The exact rendered text, host facts included. */
    fingerprint: string;
    instructions: string;
    /**
     * The render with `volatileHostFacts` held fixed: what decides whether a resumed session
     * still needs these instructions re-delivered (`instructions-update.ts`).
     */
    stableFingerprint: string;
}

/**
 * Host facts that change with a Computer release or the machine, never with what the Agent is
 * told to do. The stable fingerprint renders them fixed, so a release with unchanged instruction
 * text re-delivers nothing into resumed sessions (Raft's `STANDING_PROMPT_VOLATILE_FIELDS`). A
 * fresh session still starts on the real values, and a re-delivery carries them.
 */
export const volatileHostFacts = { hostname: '', os: '', runtimeVersion: '' } as const;

export function composeAgentInstructions(facts: AgentInstructionFacts): ComposedInstructions {
    const render: AgentPromptRenderInput = {
        agentId: facts.agentId,
        agentName: facts.agentName,
        connectionChips: facts.connectionChips ?? [],
        conversationStyle: facts.conversationStyle ?? null,
        homeTimezone: facts.homeTimezone,
        hostname: hostname(),
        initialRole: facts.initialRole,
        os: `${type()} ${release()}`,
        runtimeVersion: process.env.HAUS_COMPUTER_PRODUCT_VERSION ?? computerPackage.version,
        signatureEmoji: facts.signatureEmoji ?? null,
        supportsSubagents: supportsSubagents(facts.runtimeId),
        workspacePath: facts.workspacePath,
    };
    const instructions = renderAgentInstructions(render);
    return {
        fingerprint: sha256(instructions),
        instructions,
        stableFingerprint: sha256(renderAgentInstructions({ ...render, ...volatileHostFacts })),
    };
}

function sha256(text: string): string {
    return createHash('sha256').update(text).digest('hex');
}
