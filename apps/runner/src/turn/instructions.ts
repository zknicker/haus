import { createHash } from 'node:crypto';
import {
    formatInstructionsUpdate,
    formatMemoryBlock,
    type planRulesDelivery,
    renderAgentInstructions,
    renderSkillListing,
    runnerMachineFacts,
    runnerRuntimeVersions,
    type SkillListingEntry,
} from '@haus/agent-prompt';
import type { AgentStartCommand } from '@haus/api';
import type { HarnessId } from './runtime-driver.ts';
import type { AgentSessionRecord } from './session-file.ts';

export function composeInstructions(
    start: AgentStartCommand,
    skills: readonly SkillListingEntry[],
    harness: HarnessId
) {
    const instructions = [
        renderAgentInstructions({
            ...runnerMachineFacts,
            runtimeVersion: runnerRuntimeVersions[harness],
            agentId: start.agentId,
            agentName: start.agentName,
            connectionChips: start.connectionChips,
            conversationStyle: start.agentConversationStyle ?? null,
            homeTimezone: start.homeTimezone ?? 'UTC',
            initialRole: start.agentDescription ?? null,
            signatureEmoji: start.agentSignatureEmoji,
            supportsSubagents: false,
        }).trimEnd(),
        renderSkillListing(skills),
    ]
        .filter(Boolean)
        .join('\n\n');
    return { fingerprint: sha256(instructions), instructions: `${instructions}\n` };
}

export type InstructionsPlan =
    | { readonly kind: 'fresh' }
    | { readonly kind: 'current' }
    | { readonly block: string; readonly kind: 'inject' };

export function planInstructionsUpdate(input: {
    composed: { fingerprint: string; instructions: string };
    isResume: boolean;
    session: Pick<AgentSessionRecord, 'deliveredInstructionFingerprint'>;
}) {
    const plan: InstructionsPlan = !input.isResume
        ? { kind: 'fresh' }
        : input.session.deliveredInstructionFingerprint === input.composed.fingerprint
          ? { kind: 'current' }
          : { block: formatInstructionsUpdate(input.composed.instructions), kind: 'inject' };
    return plan;
}

export function planMemoryDelivery(input: {
    content: string | null;
    isResume: boolean;
    receipt: string | null;
}) {
    const priorReceipt = input.isResume ? input.receipt : null;
    const digest = input.content === null ? null : sha256(input.content);
    const block =
        input.content === null || digest === priorReceipt ? null : formatMemoryBlock(input.content);
    return { block, digest, priorReceipt };
}

export function composeTurnPrompt(input: {
    instructions: InstructionsPlan;
    memoryBlock: string | null;
    rulesBlock: string | null;
    skillNotice: { readonly text: string } | null;
    turnContent: string;
}) {
    return [
        input.instructions.kind === 'inject' ? input.instructions.block : null,
        input.rulesBlock,
        input.memoryBlock,
        input.turnContent,
        input.skillNotice?.text,
    ]
        .filter(Boolean)
        .join('\n\n');
}

export function sessionAfterTurn(input: {
    composedFingerprint: string;
    memory: ReturnType<typeof planMemoryDelivery>;
    nativeSessionId: string;
    outcome: 'completed' | 'failed' | 'interrupted';
    plan: InstructionsPlan;
    rules: ReturnType<typeof planRulesDelivery>;
    session: AgentSessionRecord;
    turn: { bootstrapFingerprint: string; compacted: boolean };
}) {
    const { plan, session } = input;
    const completed = input.outcome === 'completed';
    const launched =
        plan.kind === 'fresh' ? input.composedFingerprint : session.launchedInstructionFingerprint;
    const delivered = plan.kind === 'fresh' || (completed && plan.kind === 'inject');
    const memoryReceipt = input.turn.compacted
        ? null
        : completed
          ? input.memory.digest
          : input.memory.priorReceipt;
    const record: AgentSessionRecord = {
        ...session,
        bootstrapFingerprint: input.turn.bootstrapFingerprint,
        deliveredInstructionFingerprint: input.turn.compacted
            ? launched
            : delivered
              ? input.composedFingerprint
              : session.deliveredInstructionFingerprint,
        deliveredMemoryDigest: memoryReceipt,
        deliveredRuleDigests: input.turn.compacted
            ? {}
            : completed
              ? input.rules.digests
              : input.rules.priorReceipts,
        interruptedTurn: input.outcome === 'interrupted',
        launchedInstructionFingerprint: launched,
        nativeSessionId: input.nativeSessionId,
    };
    return record;
}

function sha256(text: string) {
    return createHash('sha256').update(text).digest('hex');
}
