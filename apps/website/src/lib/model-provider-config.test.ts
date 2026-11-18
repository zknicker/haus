import { expect, test } from 'bun:test';
import {
    formatModelOptionLabel,
    getModelIdentityConfig,
    getModelIdentityConfigFromRef,
    getModelProviderConfig,
    getModelProviderConfigFromAccessId,
} from './model-provider-config.ts';

test('provider config normalizes known model providers for the app UI', () => {
    expect(getModelProviderConfig('openai-codex')).toMatchObject({
        accessDisplayName: 'Codex',
        color: '#3B82F6',
        configName: 'openai-codex',
        displayName: 'Codex',
    });
});

test('provider config resolves branded runtime provider variants to SVGL logos', () => {
    expect(getModelProviderConfig('xai')).toMatchObject({
        configName: 'xai',
        displayName: 'xAI',
        logo: {
            dark: 'https://svgl.app/library/xai_dark.svg',
            light: 'https://svgl.app/library/xai_light.svg',
        },
    });
    expect(getModelProviderConfig('xai-grok-oauth')).toMatchObject({
        configName: 'xai',
        displayName: 'xAI',
    });
    expect(getModelProviderConfig('qwen-oauth-portal')).toMatchObject({
        configName: 'qwen',
        displayName: 'Qwen',
        logo: {
            dark: 'https://svgl.app/library/qwen_dark.svg',
            light: 'https://svgl.app/library/qwen_light.svg',
        },
    });
});

test('provider config tolerates runtime display names as provider identifiers', () => {
    expect(getModelProviderConfig('Azure Foundry')).toMatchObject({
        configName: 'azure-foundry',
        displayName: 'Azure Foundry',
        logo: {
            light: 'https://svgl.app/library/azure.svg',
        },
    });
    expect(getModelProviderConfig('Claude Code Oauth')).toMatchObject({
        configName: 'claude-code-oauth',
        displayName: 'Claude Code OAuth',
        logo: {
            light: 'https://svgl.app/library/anthropic_black.svg',
        },
    });
});

test('provider config resolves discovered runtime providers to brand logos', () => {
    expect(getModelProviderConfig('alibaba-coding-plan')).toMatchObject({
        configName: 'alibaba-coding-plan',
        displayName: 'Alibaba Cloud (Coding Plan)',
        logo: {
            light: 'https://thesvg.org/icons/alibabacloud/default.svg',
        },
    });
    expect(getModelProviderConfig('arcee')).toMatchObject({
        configName: 'arcee',
        displayName: 'Arcee AI',
        logo: {
            light: 'https://thesvg.org/icons/arcee/default.svg',
        },
    });
    expect(getModelProviderConfig('bedrock')).toMatchObject({
        configName: 'bedrock',
        displayName: 'AWS Bedrock',
        logo: {
            light: 'https://thesvg.org/icons/aws-amazon-bedrock/default.svg',
        },
    });
});

test('provider config preserves provider labels when vendors share a brand mark', () => {
    expect(getModelProviderConfig('anthropic')).toMatchObject({
        accessId: 'anthropic',
        configName: 'anthropic',
        displayName: 'Anthropic',
        logo: {
            light: 'https://svgl.app/library/anthropic_black.svg',
        },
    });
    expect(getModelProviderConfig('claude')).toMatchObject({
        accessId: 'claude',
        configName: 'claude',
        displayName: 'Claude Code',
        logo: {
            light: 'https://svgl.app/library/anthropic_black.svg',
        },
    });
    expect(getModelProviderConfig('claude-code-oauth')).toMatchObject({
        accessId: null,
        configName: 'claude-code-oauth',
        displayName: 'Claude Code OAuth',
        logo: {
            light: 'https://svgl.app/library/anthropic_black.svg',
        },
    });
});

test('provider config resolves non-logo provider rows to purpose-fit fallback icons', () => {
    expect(getModelProviderConfig('custom')).toMatchObject({
        accessId: null,
        configName: 'custom',
        displayName: 'Custom endpoint',
    });
});

test('unknown providers fall back to generic display metadata', () => {
    expect(getModelProviderConfig('local-test-provider')).toMatchObject({
        accessId: null,
        configName: 'local-test-provider',
        displayName: 'Local Test Provider',
    });
});

test('access ids resolve back to the same provider branding', () => {
    expect(getModelProviderConfigFromAccessId('codex')).toMatchObject({
        accessDisplayName: 'Codex',
        configName: 'openai-codex',
        displayName: 'Codex',
    });
});

test('model config uses provider labels without repeating the provider label', () => {
    expect(
        getModelIdentityConfig({
            fallbackName: 'Codex',
            modelId: 'gpt-5.4',
            providerId: 'openai-codex',
        })
    ).toMatchObject({
        displayName: 'gpt-5.4',
        ref: 'openai-codex/gpt-5.4',
    });

    expect(
        getModelIdentityConfigFromRef('openrouter/moonshotai/kimi-k2.5', 'MoonshotAI: Kimi K2.5')
    ).toMatchObject({
        displayName: 'MoonshotAI: Kimi K2.5',
        ref: 'openrouter/moonshotai/kimi-k2.5',
    });
});

test('model option labels fall back to model ids when metadata is missing', () => {
    expect(
        formatModelOptionLabel({
            modelId: 'gpt-5.4-mini',
            providerId: 'openai-codex',
        })
    ).toBe('gpt-5.4-mini');
});
