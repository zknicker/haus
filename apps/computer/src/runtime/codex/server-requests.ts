import { JsonRpcHandlerError } from '../json-rpc-connection.ts';
import { jsonRpcMethodNotFound } from '../json-rpc.ts';

export const refusedApproval =
    'Haus Workers run without permission prompts, so this request was refused. Continue inside your sandbox, or report needs-you with `haus worker report`.';

export function answerCodexServerRequest(method: string) {
    switch (method) {
        case 'item/commandExecution/requestApproval':
        case 'item/fileChange/requestApproval':
            return { decision: 'decline' };
        case 'execCommandApproval':
        case 'applyPatchApproval':
            return { decision: { denied: { rejection: refusedApproval } } };
        case 'item/permissions/requestApproval':
            return { permissions: {}, scope: 'turn' };
        case 'mcpServer/elicitation/request':
            return { _meta: null, action: 'decline', content: null };
        default:
            throw new JsonRpcHandlerError({
                code: jsonRpcMethodNotFound,
                message: `Codex app-server request "${method}" is not supported by the unattended Haus driver.`,
            });
    }
}
