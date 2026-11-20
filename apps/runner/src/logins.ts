import type { RunnerInventoryFrame } from '@haus/api';
import type { RunnerConfig } from './config.ts';

export function runnerInventory(config: Pick<RunnerConfig, 'claudeSetupToken'>) {
    return {
        harnesses: ['claude-agent-sdk'],
        logins: [
            { provider: 'claude', state: config.claudeSetupToken ? 'ready' : 'missing' },
            { provider: 'chatgpt', state: 'missing' },
            { provider: 'xai', state: 'missing' },
            { provider: 'gemini', state: 'missing' },
            { provider: 'openrouter', state: 'missing' },
        ],
        type: 'runner-inventory',
    } satisfies RunnerInventoryFrame;
}
