import { Atom02Icon, ChatGptIcon, Globe02Icon } from '@hugeicons-pro/core-stroke-rounded';
import type { ModelProviderConfig } from './model-provider-config.ts';
import {
    anthropicProviderLogo,
    kimiLogo,
    openAiLogo,
    openRouterLogo,
} from './model-provider-logo-presets.ts';

export { logoModelProviderPresets } from './model-provider-logo-presets.ts';

export const configuredModelProviders = [
    {
        accessDisplayName: 'Codex',
        accessId: 'codex',
        color: '#3B82F6',
        configName: 'openai-codex',
        displayName: 'Codex',
        icon: ChatGptIcon,
        logo: openAiLogo,
    },
    {
        accessDisplayName: 'OpenAI API',
        accessId: 'openai',
        color: '#10A37F',
        configName: 'openai-api',
        displayName: 'OpenAI',
        icon: ChatGptIcon,
        logo: openAiLogo,
    },
    {
        accessDisplayName: 'Claude',
        accessId: 'claude',
        color: '#D97757',
        configName: 'claude',
        displayName: 'Claude Code',
        icon: Atom02Icon,
        logo: anthropicProviderLogo,
    },
    {
        accessDisplayName: 'Anthropic API',
        accessId: 'anthropic',
        color: '#D97757',
        configName: 'anthropic',
        displayName: 'Anthropic',
        icon: Atom02Icon,
        logo: anthropicProviderLogo,
    },
    {
        accessDisplayName: 'Kimi Code',
        accessId: 'kimi',
        color: '#027AFF',
        configName: 'kimi',
        displayName: 'Kimi Code',
        icon: Atom02Icon,
        logo: kimiLogo,
    },
    {
        accessDisplayName: 'OpenRouter',
        accessId: 'openrouter',
        color: '#8B5CF6',
        configName: 'openrouter',
        displayName: 'OpenRouter',
        icon: Globe02Icon,
        logo: openRouterLogo,
    },
] as const satisfies readonly ModelProviderConfig[];

export const iconModelProviderPresets = [
    ['custom', 'Custom endpoint', '#64748B', Globe02Icon],
    ['custom-endpoint', 'Custom endpoint', '#64748B', Globe02Icon],
    ['gmi', 'GMI Cloud', '#2563EB', Globe02Icon],
] as const satisfies readonly [
    configName: string,
    displayName: string,
    color: string,
    icon: ModelProviderConfig['icon'],
][];

export const providerConfigAliasIds = [
    {
        aliases: ['alibaba-coding-plan', 'alibaba-coding', 'alibaba_coding'],
        providerId: 'alibaba-coding-plan',
    },
    {
        aliases: ['amazon-bedrock', 'aws-bedrock', 'bedrock'],
        providerId: 'bedrock',
    },
    {
        aliases: ['github-copilot', 'github-copilot-acp', 'copilot', 'copilot-acp'],
        providerId: 'github-copilot',
    },
    {
        aliases: ['hf', 'hugging-face', 'huggingface'],
        providerId: 'huggingface',
    },
    {
        aliases: ['kimi-coding', 'kimi-for-coding'],
        providerId: 'kimi-coding',
    },
    {
        aliases: ['kilocode', 'kilo-code', 'kilo'],
        providerId: 'kilocode',
    },
    {
        aliases: ['codex', 'openai-codex'],
        providerId: 'openai-codex',
    },
    {
        aliases: ['openai', 'openai-api'],
        providerId: 'openai-api',
    },
    {
        aliases: ['opencode', 'opencode-zen'],
        providerId: 'opencode-zen',
    },
    {
        aliases: ['qwen', 'qwen-oauth', 'qwen-oauth-portal'],
        providerId: 'qwen',
    },
    {
        aliases: ['xai', 'xai-grok', 'xai-grok-oauth', 'xai-oauth', 'grok', 'grok-oauth'],
        providerId: 'xai',
    },
] as const;
