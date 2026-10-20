export type HeartbeatRefusal =
    | 'DREAM_RUN_REQUIRED'
    | 'HEARTBEAT_REPORT_EXISTS'
    | 'HEARTBEAT_RUN_REQUIRED'
    | 'LEAD_NOT_OWNED';

/** A heartbeat request this run may not make; the Agent API maps `code` to a CLI-printable error. */
export class HeartbeatRefusedError extends Error {
    constructor(
        readonly code: HeartbeatRefusal,
        message: string,
        readonly status: 403 | 409 = 403
    ) {
        super(message);
        this.name = 'HeartbeatRefusedError';
    }
}

export class LeadNotFoundError extends Error {
    constructor() {
        super('That lead does not exist on this Server.');
        this.name = 'LeadNotFoundError';
    }
}
