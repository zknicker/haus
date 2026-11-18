import type { AgentReasoningEffort, ComputerInventory } from '@haus/api';
import type { AvatarImage } from '../avatars/resize-avatar-image.ts';

export interface ReportedComputer {
    id: string;
    inventory: ComputerInventory;
    label: string;
}

export interface AgentCreationSubmitValues {
    avatar?: {
        bytesBase64: string;
        mediaType: AvatarImage['mediaType'];
    };
    computerId: string;
    description: string | null;
    displayName: string;
    handle: string;
    modelId: string;
    reasoningEffort: AgentReasoningEffort;
    runtimeId: string;
    /** Null keeps the default pickup reaction. */
    signatureEmoji: string | null;
}
