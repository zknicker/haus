import type { MessageClaim } from '@haus/api';
import type { PreparedRealtimeEvent } from '../realtime/topic.ts';

export class ClaimConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ClaimConflictError';
    }
}

export class ClaimNotFoundError extends Error {
    constructor() {
        super('No claim exists in this Server with that message id.');
        this.name = 'ClaimNotFoundError';
    }
}

export interface ClaimMutationResult {
    claim: MessageClaim;
    event: PreparedRealtimeEvent | null;
}
