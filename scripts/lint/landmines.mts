import { allowances } from './grandfathered-overrides.mts';

export const landminesPlugins = [
    { name: 'landmines-testing', specifier: '@interfere/landmines/testing' },
    { name: 'landmines-style', specifier: '@interfere/landmines/style' },
    { name: 'landmines-structure', specifier: '@interfere/landmines/structure' },
    { name: 'landmines-types', specifier: '@interfere/landmines/types' },
];

const ratchetedRules = [
    'landmines-testing/no-fixed-sleep',
    'landmines-testing/no-flake-masking',
    'landmines-testing/no-unsignaled-poll',
    'landmines-testing/strict-msw',
] as const;

export const landminesRules = {
    ...Object.fromEntries(ratchetedRules.map((rule) => [rule, ratchet(rule)])),
    'landmines-testing/no-test-doubles': 'error',
    'landmines-style/no-comments': ['error', { publicApi: ['/packages/'] }],
    'landmines-structure/colocated-tests': 'error',
    'landmines-structure/package-exports': 'error',
    'landmines-structure/test-file-names': 'error',
    'landmines-types/no-explicit-return-types': 'error',
} as const;

export const landminesOverrides = [
    {
        files: ['apps/website/e2e/**', 'apps/website/agent-e2e/**'],
        rules: { 'landmines-structure/test-file-names': 'off' as const },
    },
    {
        files: ['apps/server/test/**'],
        rules: { 'landmines-structure/colocated-tests': 'off' as const },
    },
];

function ratchet(rule: (typeof ratchetedRules)[number]) {
    const allow = allowances(rule);
    return Object.keys(allow).length === 0 ? 'error' : ['error', { allow }];
}
