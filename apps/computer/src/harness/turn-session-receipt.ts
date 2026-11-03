import { type AgentReasoningEffort, hausAgentVersion } from '@haus/api';
import type { RuntimeResumeState } from '../runtime/resume-state.ts';
import type { ComposedInstructions } from './instructions.ts';
import { deliveredInstructionReceipt, type InstructionsUpdatePlan } from './instructions-update.ts';
import type { AgentSessionState } from './session-store.ts';

export interface CompletedTurnFacts {
    bootstrapFingerprint: string | null;
    composed: Pick<ComposedInstructions, 'fingerprint' | 'stableFingerprint'>;
    /** False when a Cove factory-guidance conflict keeps the version unapplied. */
    coveGuidanceCanApply: boolean;
    instructionsUpdate: InstructionsUpdatePlan;
    modelId: string;
    reasoningEffort: AgentReasoningEffort;
    resumeState: RuntimeResumeState;
    runtimeId: string;
    runtimeSessionId: string;
}

/**
 * The session an interrupted turn leaves: its resume point moves, its instruction receipt does
 * not, so the next turn re-delivers any update this one carried. Version drift reads failed.
 */
export function interruptedTurnSession(
    session: AgentSessionState,
    reasoningEffort: AgentReasoningEffort,
    resumeState: RuntimeResumeState,
    runtimeSessionId: string
): AgentSessionState {
    return {
        ...session,
        effectiveReasoningEffort: reasoningEffort,
        hausAgentStatus:
            session.hausAgentVersion === hausAgentVersion ? session.hausAgentStatus : 'failed',
        interruptedTurn: true,
        resumeState,
        runtimeSessionId,
    };
}

/**
 * The session a completed turn leaves. The Haus Agent version covers the managed instructions,
 * so drift becomes current only on a turn that delivered them; a wake turn that deferred them
 * leaves it pending for the next ordinary turn. Any completed turn clears `interruptedTurn`.
 */
export function completedTurnSession(
    session: AgentSessionState,
    facts: CompletedTurnFacts
): AgentSessionState {
    const versionDrift = session.hausAgentVersion !== hausAgentVersion;
    const instructionsDelivered = facts.instructionsUpdate.kind !== 'deferred';
    const applies = !versionDrift || (facts.coveGuidanceCanApply && instructionsDelivered);
    return {
        ...deliveredInstructionReceipt(facts.instructionsUpdate, session, facts.composed),
        bootstrapFingerprint: facts.bootstrapFingerprint,
        effectiveModel: { modelId: facts.modelId, runtimeId: facts.runtimeId },
        effectiveReasoningEffort: facts.reasoningEffort,
        generation: session.generation,
        hausAgentAppliedAt:
            versionDrift && applies ? new Date().toISOString() : session.hausAgentAppliedAt,
        hausAgentStatus: applies ? 'current' : facts.coveGuidanceCanApply ? 'pending' : 'failed',
        hausAgentVersion: applies ? hausAgentVersion : session.hausAgentVersion,
        resumeState: facts.resumeState,
        runtimeSessionId: facts.runtimeSessionId,
    };
}
