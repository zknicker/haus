import { allowances } from './grandfathered-overrides.mts';

const ratchetedRules = [
    'landmines-testing/no-fixed-sleep',
    'landmines-testing/no-flake-masking',
    'landmines-testing/no-unsignaled-poll',
    'landmines-testing/strict-msw',
] as const;

export const landminesRules = {
    ...Object.fromEntries(ratchetedRules.map((rule) => [rule, ratchet(rule)])),
    'landmines-style/no-comments': ['error', { allow: ['WARNING'], publicApi: ['/packages/'] }],
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
