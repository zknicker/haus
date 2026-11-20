import type { ComputerRuntimeId, ModelProvider } from '@haus/api';
import { ModelProviderLogo } from '../../../../components/badges/model-provider-logo.tsx';
import { identityMarkRadius } from '../../../../components/ui/entity-avatar.tsx';
import { getModelProviderConfig } from '../../../../lib/model-provider-config.ts';

export type ModelAccountMarkId = ComputerRuntimeId | ModelProvider;

const markSize = 32;

export function ModelAccountMark({ account }: { account: ModelAccountMarkId }) {
    const provider = getModelProviderConfig(providerConfigIds[account]);
    return (
        <ModelProviderLogo
            className="shrink-0"
            color={provider.color}
            fallbackIcon={provider.icon}
            iconClassName="size-4"
            logo={provider.logo}
            style={{
                borderRadius: identityMarkRadius(markSize),
                height: markSize,
                width: markSize,
            }}
        />
    );
}

const providerConfigIds: Record<ModelAccountMarkId, string> = {
    chatgpt: 'openai',
    'claude-code': 'claude-code',
    claude: 'claude',
    codex: 'codex',
    gemini: 'gemini',
    'grok-build': 'grok-build',
    openrouter: 'openrouter',
    xai: 'xai',
};
