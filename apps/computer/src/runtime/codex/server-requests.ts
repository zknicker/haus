/**
 * Haus Agents run unattended with full access: Codex never asks under `approvalPolicy: never` and
 * `danger-full-access`, and anything it still asks is answered the way that policy would. A
 * question meant for a human (`requestUserInput`, an MCP elicitation) has no human to reach, so
 * it is declined or refused; Agents ask people in a Haus message instead.
 */
export function answerCodexServerRequest(method: string, params: unknown): unknown {
    switch (method) {
        case 'item/commandExecution/requestApproval':
        case 'item/fileChange/requestApproval':
            return { decision: 'accept' };
        case 'execCommandApproval':
        case 'applyPatchApproval':
            return { decision: 'approved' };
        case 'item/permissions/requestApproval':
            return { permissions: requestedPermissions(params), scope: 'session' };
        case 'mcpServer/elicitation/request':
            return { _meta: null, action: 'decline', content: null };
        default:
            throw new Error(
                `Codex app-server request "${method}" is not supported by the unattended Haus driver.`
            );
    }
}

/** Grants exactly what the request asked for, dropping the profile's null halves. */
function requestedPermissions(params: unknown): Record<string, unknown> {
    const permissions =
        typeof params === 'object' && params !== null && 'permissions' in params
            ? (params as { permissions: unknown }).permissions
            : null;
    if (typeof permissions !== 'object' || permissions === null) {
        return {};
    }
    return Object.fromEntries(Object.entries(permissions).filter(([, value]) => value !== null));
}
