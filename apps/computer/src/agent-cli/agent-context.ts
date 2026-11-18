import fs from 'node:fs';

import { AgentCliError } from './agent-error.ts';

const tokenPattern = /^grta_[A-Za-z0-9_-]{43}$/u;

export interface AgentContext {
    agentId: string;
    serverUrl: string;
    token: string;
    tokenFile: string;
}

type AgentEnvironment = Record<string, string | undefined>;

export function hasAgentIdentityEnvironment(environment: AgentEnvironment = process.env): boolean {
    return Boolean(
        environment.HAUS_AGENT_ID ||
        environment.HAUS_SERVER_URL ||
        environment.HAUS_AGENT_TOKEN_FILE
    );
}

export function resolveAgentContext(
    environment: AgentEnvironment = process.env,
    readFile: (filePath: string) => string = (filePath) => fs.readFileSync(filePath, 'utf8')
): AgentContext {
    const agentId = environment.HAUS_AGENT_ID?.trim();
    if (!agentId) {
        throw bootstrapError(
            'MISSING_AGENT_ID',
            'HAUS_AGENT_ID is required.',
            'Run this command from a Haus Computer Agent shell.'
        );
    }
    // Agent ids are opaque in the public contract; require only a single
    // path-safe token (same rule the Computer token store applies).
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u.test(agentId)) {
        throw bootstrapError(
            'MISSING_AGENT_ID',
            'HAUS_AGENT_ID must be a single path-safe token.',
            'Start a new agent turn so the Computer can refresh the Agent identity.'
        );
    }
    const serverUrl = environment.HAUS_SERVER_URL?.trim();
    if (!serverUrl) {
        throw bootstrapError(
            'MISSING_SERVER_URL',
            'HAUS_SERVER_URL is required.',
            'Run this command from a Haus Computer Agent shell.'
        );
    }
    assertServerUrl(serverUrl);
    const tokenFile = environment.HAUS_AGENT_TOKEN_FILE?.trim();
    if (!tokenFile) {
        throw bootstrapError(
            'MISSING_TOKEN',
            'HAUS_AGENT_TOKEN_FILE is required.',
            'Start a new agent turn so the Computer can provide an Agent token file.'
        );
    }
    let rawToken: string;
    try {
        rawToken = readFile(tokenFile);
    } catch {
        throw bootstrapError(
            'TOKEN_FILE_UNREADABLE',
            `Agent token file is unreadable: ${tokenFile}`,
            'Start a new agent turn so the Computer can refresh the Agent token file.'
        );
    }
    const token = rawToken.trim();
    if (!token) {
        throw bootstrapError(
            'TOKEN_FILE_EMPTY',
            `Agent token file is empty: ${tokenFile}`,
            'Start a new agent turn so the Computer can refresh the Agent token file.'
        );
    }
    if (!tokenPattern.test(token)) {
        throw bootstrapError(
            'MISSING_TOKEN',
            `Agent token file does not contain a valid grta_ token: ${tokenFile}`,
            'Start a new agent turn so the Computer can rotate the Agent token.'
        );
    }
    return { agentId, serverUrl, token, tokenFile };
}

function assertServerUrl(serverUrl: string): void {
    try {
        const parsed = new URL(serverUrl);
        if (!(parsed.protocol === 'http:' || parsed.protocol === 'https:')) {
            throw new Error('unsupported protocol');
        }
    } catch {
        throw bootstrapError(
            'MISSING_SERVER_URL',
            'HAUS_SERVER_URL must be an HTTP or HTTPS URL.',
            'Start a new agent turn so the Computer can refresh the Server URL.'
        );
    }
}

function bootstrapError(code: string, message: string, nextAction: string): AgentCliError {
    return new AgentCliError(code, message, { nextAction });
}
