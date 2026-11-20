import type { RunnerInventoryFrame } from '@haus/api';
import type { RunnerConfig } from './config.ts';
import { chatgptLoginState } from './pi/pi-credentials.ts';
import { harnessIds } from './turn/runtime-driver.ts';

export type LoginConfig = Pick<
    RunnerConfig,
    'claudeSetupToken' | 'dataDir' | 'geminiApiKey' | 'openrouterApiKey' | 'xaiApiKey'
>;

export function runnerInventory(config: LoginConfig) {
    const present = (value: string | null) => (value ? ('ready' as const) : ('missing' as const));
    return {
        harnesses: [...harnessIds],
        logins: [
            { provider: 'claude', state: present(config.claudeSetupToken) },
            { provider: 'chatgpt', state: chatgptLoginState(config.dataDir) },
            { provider: 'xai', state: present(config.xaiApiKey) },
            { provider: 'gemini', state: present(config.geminiApiKey) },
            { provider: 'openrouter', state: present(config.openrouterApiKey) },
        ],
        type: 'runner-inventory',
    } satisfies RunnerInventoryFrame;
}
