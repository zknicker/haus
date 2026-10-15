/**
 * Why the Server refused a Linear request. Each maps to one tRPC code, and the
 * message leads with a stable reason the App and Agents key on
 * (`linear_admin_required: …`). Messages never name another Haus Server.
 */
export type LinearRefusalCode = 'BAD_REQUEST' | 'CONFLICT' | 'FORBIDDEN' | 'NOT_FOUND';

export type LinearRefusalReason =
    | 'linear_admin_required'
    | 'linear_agent_not_granted'
    | 'linear_app_unconfigured'
    | 'linear_connection_not_found'
    | 'linear_identity_already_bound'
    | 'linear_identity_mismatch'
    | 'linear_identity_not_found'
    | 'linear_identity_state'
    | 'linear_organization_mismatch'
    | 'linear_sign_in_required'
    | 'linear_workspace_already_bound';

export class LinearRefusedError extends Error {
    constructor(
        readonly code: LinearRefusalCode,
        readonly reason: LinearRefusalReason,
        detail: string
    ) {
        super(`${reason}: ${detail}`);
        this.name = 'LinearRefusedError';
    }
}

/** The chosen credential is `refresh_required` or `revoked`; a reconnect is needed. */
export class LinearSignInRequiredError extends LinearRefusedError {
    constructor(detail = 'Reconnect Linear from Settings → Connections.') {
        super('BAD_REQUEST', 'linear_sign_in_required', detail);
        this.name = 'LinearSignInRequiredError';
    }
}

export function linearAdminRequired() {
    return new LinearRefusedError(
        'FORBIDDEN',
        'linear_admin_required',
        'Only a Server Owner or Admin can manage Linear.'
    );
}

export function linearAppUnconfigured() {
    return new LinearRefusedError(
        'BAD_REQUEST',
        'linear_app_unconfigured',
        'The Haus Linear app is not configured on this Server.'
    );
}
