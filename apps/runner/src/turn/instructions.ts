import { createHash } from 'node:crypto';
import {
    formatInstructionsUpdate,
    formatMemoryBlock,
    formatRulesBlock,
    renderAgentInstructions,
    renderSkillListing,
    runnerMachineFacts,
    type SkillListingEntry,
} from '@haus/agent-prompt';
import type { AgentStartCommand } from '@haus/api';
import type { RuleFile } from './agent-context.ts';
import type { AgentSessionRecord } from './session-file.ts';

export function composeInstructions(
    start: AgentStartCommand,
    skills: readonly SkillListingEntry[]
) {
    const instructions = [
        renderAgentInstructions({
            ...runnerMachineFacts,
            agentId: start.agentId,
            agentName: start.agentName ?? start.agentId,
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

export function planRulesDelivery(input: {
    files: readonly RuleFile[];
    isResume: boolean;
    receipts: Readonly<Record<string, string>>;
}) {
    const priorReceipts = input.isResume ? input.receipts : {};
    const current = input.files.map((file) => ({
        ...file,
        digest: file.content === null ? null : sha256(file.content),
    }));
    const changes = current.filter((file) =>
        file.digest === null
            ? Object.hasOwn(priorReceipts, file.path)
            : priorReceipts[file.path] !== file.digest
    );
    const unread = Object.entries(priorReceipts).filter(
        ([path]) => !current.some((file) => file.path === path)
    );
    const digests = Object.fromEntries([
        ...unread,
        ...current.flatMap((file) => (file.digest === null ? [] : [[file.path, file.digest]])),
    ]);
    return { block: formatRulesBlock(changes), digests, priorReceipts };
}

export function composeTurnPrompt(input: {
    instructions: InstructionsPlan;
    memoryBlock: string | null;
    rulesBlock: string | null;
    turnContent: string;
}) {
    return [
        input.instructions.kind === 'inject' ? input.instructions.block : null,
        input.rulesBlock,
        input.memoryBlock,
        input.turnContent,
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
