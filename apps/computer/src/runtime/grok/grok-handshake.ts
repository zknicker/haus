import * as z from 'zod';
import { computerVersion } from '../../build-identity.ts';
import type { HostToolMcpDescriptor } from '../../host-tools/mcp-server.ts';
import type { AcpConnection } from './acp-connection.ts';
import { type GrokCredential, grokAuthMethod } from './grok-auth.ts';
import { grokSessionMeta } from './grok-launch.ts';
import { AcpRequestError } from './json-rpc.ts';

export const GROK_ACP_PROTOCOL_VERSION = 1;

/**
 * The client advertises no file system or terminal: Grok runs its own tools in the workspace,
 * as it did under the AI SDK harness.
 */
const initializeParams = {
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
    clientInfo: { name: 'haus-computer', version: computerVersion },
    protocolVersion: GROK_ACP_PROTOCOL_VERSION,
};

const initializeResultSchema = z.looseObject({
    agentCapabilities: z.looseObject({ loadSession: z.boolean().optional() }).optional(),
    authMethods: z.array(z.looseObject({ id: z.string() })).optional(),
    protocolVersion: z.number(),
});

/** `session/new` and `session/load` results; load omits the id it was given. */
const sessionResultSchema = z.looseObject({
    models: z.looseObject({ availableModels: z.array(z.unknown()) }).nullish(),
    sessionId: z.string().min(1).optional(),
});
type SessionResult = z.infer<typeof sessionResultSchema>;
const setModelResultSchema = z
    .looseObject({ _meta: z.looseObject({ model: z.unknown() }).nullish() })
    .nullish();

/** `session/load` named a session Grok has no record of (it answers `FS_NOT_FOUND`). */
export class GrokSessionNotFoundError extends Error {
    constructor(sessionId: string, options?: { cause?: unknown }) {
        // "session not found" is the wording resume-rejection.ts recognizes.
        super(`Grok Build session not found: ${sessionId}.`, options);
        this.name = 'GrokSessionNotFoundError';
    }
}

export interface GrokAcpSession {
    readonly isResume: boolean;
    readonly sessionId: string;
}

/** initialize → authenticate → `session/new` or `session/load` → `session/set_model`. */
export async function openGrokAcpSession(input: {
    connection: AcpConnection;
    credential: GrokCredential;
    cwd: string;
    hostTools: HostToolMcpDescriptor;
    modelId: string;
    resumeSessionId: string | undefined;
    signal?: AbortSignal;
}): Promise<GrokAcpSession> {
    const { connection, signal } = input;
    const initialized = initializeResultSchema.parse(
        await connection.request('initialize', initializeParams, { signal })
    );
    if (initialized.protocolVersion !== GROK_ACP_PROTOCOL_VERSION) {
        throw new Error(
            `Grok Build speaks ACP v${initialized.protocolVersion}; Haus needs v${GROK_ACP_PROTOCOL_VERSION}. Update Grok Build.`
        );
    }
    const method = grokAuthMethod(
        input.credential,
        (initialized.authMethods ?? []).map((entry) => entry.id)
    );
    if (method) {
        await connection.request('authenticate', { methodId: method }, { signal });
    }
    const sessionParams = {
        _meta: grokSessionMeta(),
        cwd: input.cwd,
        mcpServers: [acpMcpServer(input.hostTools)],
    };
    let opened: SessionResult;
    let sessionId: string;
    if (input.resumeSessionId) {
        if (initialized.agentCapabilities?.loadSession !== true) {
            throw new Error('Grok Build does not advertise session/load; it cannot resume.');
        }
        sessionId = input.resumeSessionId;
        opened = await loadSession(connection, { ...sessionParams, sessionId }, signal);
    } else {
        opened = sessionResultSchema.parse(
            await connection.request('session/new', sessionParams, { signal })
        );
        if (!opened.sessionId) {
            throw new Error('Grok answered session/new without a sessionId.');
        }
        sessionId = opened.sessionId;
    }
    try {
        await selectModel(connection, { modelId: input.modelId, sessionId }, signal);
    } catch (error) {
        // Grok lists no models to a login it cannot use; set_model is where that first shows.
        throw opened.models?.availableModels.length === 0 ? new GrokSignedOutError(error) : error;
    }
    return { isResume: input.resumeSessionId !== undefined, sessionId };
}

/** Grok answered with an empty model catalog: its login is missing or rejected. */
export class GrokSignedOutError extends Error {
    constructor(cause: unknown) {
        super('Grok Build offers no models to this login. Run `grok login` on this machine.', {
            cause,
        });
        this.name = 'GrokSignedOutError';
    }
}

/** Switches the session's model; a mismatch with the warm process's model is fixed this way. */
export async function selectModel(
    connection: AcpConnection,
    params: { modelId: string; sessionId: string },
    signal?: AbortSignal
): Promise<void> {
    const result = setModelResultSchema.parse(
        await connection.request('session/set_model', params, { signal })
    );
    const model = result?._meta?.model;
    if (typeof model === 'object' && model !== null && 'Err' in model) {
        throw new Error(
            `Grok Build rejected model ${params.modelId}: ${JSON.stringify(model.Err)}`
        );
    }
}

async function loadSession(
    connection: AcpConnection,
    params: Record<string, unknown> & { sessionId: string },
    signal?: AbortSignal
): Promise<SessionResult> {
    try {
        return sessionResultSchema.parse(
            await connection.request('session/load', params, { signal })
        );
    } catch (error) {
        throw isMissingSession(error)
            ? new GrokSessionNotFoundError(params.sessionId, { cause: error })
            : error;
    }
}

function isMissingSession(error: unknown): boolean {
    if (!(error instanceof AcpRequestError)) {
        return false;
    }
    const data = z.looseObject({ code: z.string() }).safeParse(error.data);
    return data.success && data.data.code === 'FS_NOT_FOUND';
}

/** ACP's HTTP MCP server shape for the Haus host-tool server. */
function acpMcpServer(descriptor: HostToolMcpDescriptor) {
    return {
        headers: Object.entries(descriptor.headers).map(([name, value]) => ({ name, value })),
        name: descriptor.name,
        type: descriptor.transport,
        url: descriptor.url,
    };
}
