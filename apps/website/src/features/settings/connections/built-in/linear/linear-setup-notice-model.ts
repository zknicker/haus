export interface LinearSetupNotice {
    description: string;
    status: 'accent' | 'danger' | 'success';
    title: string;
}

type NoticeCopy = Omit<LinearSetupNotice, 'status'>;

const successNotices: Record<string, NoticeCopy> = {
    identity_installed: {
        description: 'The Agent now acts in Linear as its own app.',
        title: 'Linear identity installed',
    },
    workspace_connected: {
        description: 'Agents with access to this connection can use it now.',
        title: 'Linear connected',
    },
    workspace_reconnected: {
        description: 'Agents with access to this connection can use it again.',
        title: 'Linear reconnected',
    },
};

const refusalNotices: Record<string, NoticeCopy> = {
    linear_admin_required: {
        description: 'Only a Server Owner or Admin can connect Linear.',
        title: 'Not connected',
    },
    linear_connection_not_found: {
        description: 'That Linear connection was removed before the install finished.',
        title: 'Connection removed',
    },
    linear_identity_already_bound: {
        description: 'That Linear app is already a Haus Agent identity.',
        title: 'Already in use',
    },
    linear_identity_mismatch: {
        description:
            "Linear authorized a different app than the Agent's identity. Install the app whose client ID you saved.",
        title: 'Different app',
    },
    linear_identity_not_found: {
        description: "The Agent's Linear identity was removed before the install finished.",
        title: 'Identity not found',
    },
    linear_organization_mismatch: {
        description:
            "Linear authorized a different workspace than this connection's. Switch workspaces in Linear and try again.",
        title: 'Different workspace',
    },
    linear_unavailable: {
        description: 'Linear did not answer. Try again shortly.',
        title: 'Linear unavailable',
    },
    linear_workspace_already_bound: {
        description: 'That Linear workspace is already connected to a Haus Server.',
        title: 'Already connected',
    },
};

/** What the install callback's outcome means, in the Linear page's words. */
export function linearSetupNotice(outcome: string): LinearSetupNotice {
    const success = successNotices[outcome];
    if (success) {
        return { ...success, status: 'success' };
    }
    if (outcome === 'linear_denied') {
        return {
            description: 'Linear did not authorize the install.',
            status: 'accent',
            title: 'Install canceled',
        };
    }
    const notice = refusalNotices[outcome] ?? {
        description: 'The install did not finish. Try again.',
        title: 'Not connected',
    };
    return { ...notice, status: 'danger' };
}
