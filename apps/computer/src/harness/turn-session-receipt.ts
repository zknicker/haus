import { type AgentReasoningEffort, hausAgentVersion } from '@haus/api';
import type { RuntimeResumeState } from '../runtime/resume-state.ts';
import { deliveredInstructionReceipt, type InstructionsUpdatePlan } from './instructions-update.ts';
import type { ComposedInstructions } from './instructions.ts';
import { type MemoryDelivery, memoryReceiptAfterTurn } from './memory-delivery.ts';
import type { AgentSessionState } from './session-store.ts';

/** What every ending of a turn on a live session records. */
export interface TurnSessionFacts {
    composed: Pick<ComposedInstructions, 'fingerprint' | 'stableFingerprint'>;
    instructionsUpdate: InstructionsUpdatePlan;
    memory: MemoryDelivery;
    reasoningEffort: AgentReasoningEffort;
    runtimeSessionId: string;
}

/** How a turn that reached the model left its native session. */
export interface EndedTurn {
    /** The runtime compacted the session's context during the turn. */
    compacted: boolean;
    resumeState: RuntimeResumeState;
}

export interface CompletedTurnFacts {
    bootstrapFingerprint: string | null;
    /** The digest of MEMORY.md at turn end; null when the file is missing. */
    memoryDigest: string | null;
    modelId: string;
    runtimeId: string;
}

/**
 * The session record a turn on a live session leaves, for each way the turn can end. Only a
 * completed turn that delivered the instructions advances the instruction receipt, except that a
 * fresh launch already runs on them however its turn ends; a compaction sets it back to the
 * launch instructions (`deliveredInstructionReceipt`).
 */
export function turnSessionRecord(session: AgentSessionState, facts: TurnSessionFacts) {
    const receipt = (turn: { compacted: boolean; completed: boolean }) =>
        deliveredInstructionReceipt(facts.instructionsUpdate, session, facts.composed, turn);
    return {
        /** Stopped before its prompt: parked where it opened. */
        stopped: (resumeState: RuntimeResumeState): AgentSessionState => ({
            ...session,
            ...receipt({ compacted: false, completed: false }),
            deliveredMemoryDigest: facts.memory.priorReceipt,
            resumeState,
            runtimeSessionId: facts.runtimeSessionId,
        }),
        /**
         * Interrupted: the resume point moves, so the next turn re-delivers any update this one
         * carried. Version drift reads failed.
         */
        interrupted: ({ compacted, resumeState }: EndedTurn): AgentSessionState => ({
            ...session,
            ...receipt({ compacted, completed: false }),
            deliveredMemoryDigest: memoryReceiptAfterTurn(facts.memory, {
                compacted,
                completed: false,
                endDigest: null,
            }),
            effectiveReasoningEffort: facts.reasoningEffort,
            hausAgentStatus:
                session.hausAgentVersion === hausAgentVersion ? session.hausAgentStatus : 'failed',
            interruptedTurn: true,
            resumeState,
            runtimeSessionId: facts.runtimeSessionId,
        }),
        /**
         * Completed. The Haus Agent version covers the managed instructions, so drift becomes
         * current only on a turn that delivered them; a wake turn that deferred them leaves it
         * pending for the next ordinary turn. Any completed turn clears `interruptedTurn`.
         */
        completed: (
            { compacted, resumeState }: EndedTurn,
            run: CompletedTurnFacts
        ): AgentSessionState => {
            const versionDrift = session.hausAgentVersion !== hausAgentVersion;
            const instructionsDelivered = facts.instructionsUpdate.kind !== 'deferred';
            const applies = !versionDrift || instructionsDelivered;
            return {
                ...receipt({ compacted, completed: true }),
                bootstrapFingerprint: run.bootstrapFingerprint,
                deliveredMemoryDigest: memoryReceiptAfterTurn(facts.memory, {
                    compacted,
                    completed: true,
                    endDigest: run.memoryDigest,
                }),
                effectiveModel: { modelId: run.modelId, runtimeId: run.runtimeId },
                effectiveReasoningEffort: facts.reasoningEffort,
                generation: session.generation,
                hausAgentAppliedAt:
                    versionDrift && applies ? new Date().toISOString() : session.hausAgentAppliedAt,
                hausAgentStatus: applies ? 'current' : 'pending',
                hausAgentVersion: applies ? hausAgentVersion : session.hausAgentVersion,
                resumeState,
                runtimeSessionId: facts.runtimeSessionId,
            };
        },
    };
}
