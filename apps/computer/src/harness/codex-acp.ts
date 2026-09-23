import { commonTool } from '@ai-sdk/harness';
import { createACP } from '@ai-sdk/harness-acp';
import * as z from 'zod';
import { codexAcpImplementationFiles } from './codex-acp-bootstrap.ts';

type CodexReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
interface CodexAcpSettings {
    reasoningEffort?: CodexReasoningEffort;
    webSearch: boolean;
}

/**
 * Codex runs as `codex-acp` (JetBrains' ACP agent over `codex app-server`)
 * behind @ai-sdk/harness-acp, because `codex exec` closes stdin and cannot be
 * steered. Haus's harness-acp patch forwards a live-turn message as codex-acp's
 * `_session/steering` request (`bridge-bootstrap.ts` refuses a bridge without it).
 */
export function createCodexAcp(settings: CodexAcpSettings) {
    const [manifest, lockfile] = codexAcpImplementationFiles;
    if (!(manifest && lockfile)) {
        throw new Error('The Codex ACP implementation manifest is missing.');
    }
    return createACP({
        builtinTools: codexBuiltinTools,
        env: codexAcpEnvironment(settings),
        executable: 'codex-acp',
        harnessId: 'codex',
        instructionMapping: {
            path: ['developer_instructions'],
            type: 'launch-env-json',
            variable: 'CODEX_CONFIG',
        },
        isMcpToolCall: (toolCall) => toolCall._meta?.is_mcp_tool_call === true,
        modelMapping: { path: 'model', type: 'session-config-option' },
        source: {
            packageJson: manifest.content,
            pnpmLockYaml: lockfile.content,
            type: 'npm-locked',
        },
    });
}

/** Launch environment for codex-acp; the harness adds instructions to `CODEX_CONFIG`. */
export function codexAcpEnvironment(settings: CodexAcpSettings): Record<string, string> {
    return {
        // codex-acp merges this into the config of every thread it starts or resumes.
        CODEX_CONFIG: JSON.stringify({
            ...(settings.reasoningEffort
                ? { model_reasoning_effort: settings.reasoningEffort }
                : {}),
            web_search: settings.webSearch ? 'live' : 'disabled',
        }),
        // Haus Agents run unattended: never ask for approval, never sandbox.
        INITIAL_AGENT_MODE: 'agent-full-access',
        NO_BROWSER: '1',
    };
}

/**
 * Only the builtins Activity names. codex-acp tags shell calls with the tool
 * name `exec_command` and sends web searches with their query as raw input.
 */
const codexBuiltinTools = {
    bash: commonTool('bash', {
        inputSchema: z.looseObject({ command: z.string() }),
        nativeName: 'exec_command',
        toolUseKind: 'bash',
    }),
    webSearch: commonTool('webSearch', {
        inputSchema: z.looseObject({ query: z.string() }),
        nativeName: 'web_search',
        toolUseKind: 'readonly',
    }),
};
