/**
 * Recognized factory guidance fingerprints, including canonical migration fixtures.
 *
 * A note whose on-disk content matches one of these is still factory-owned and may be refreshed in
 * place; anything else is treated as Cove's own edit and left alone. Add the hash of the outgoing
 * rendering whenever the playbook or FAQ text changes, or deployed Coves keep the old guidance.
 */
export const recognizedFactoryGuidanceHashes: Record<
    'notes/onboarding_knowledge_faq.md' | 'notes/onboarding_playbook.md',
    readonly string[]
> = {
    'notes/onboarding_knowledge_faq.md': [
        '309fcec4252bfab631f1c487bb591f3aab2410a7511934b80df53450a9c75c3d',
        '1c2c949bdec805ac127bb5ba2252fee726c71c0329663af92c2449f994d190e5',
        '44df10647c8f6ead5d89901cd4540c172983747da44844f00e4e431968abd2d3',
        '83778cfc1a8f9ee7b3e6674812d6a4b1b81f69a645cc374431cb5f5466ff6357',
        '23f36559dbd221b95764c2a4d3bf7995ccc2ee174674ee59652201e11249b1fb',
        '1b2de68cf54e38527070e41eb70b5164c31fda3e1ffd5763d48eb2d7e27e50c5',
    ],
    'notes/onboarding_playbook.md': [
        '189fd376a8d5c0ce50e8fa045ed4114cbdbc47c5a1cd4d85c587acb3ae5039f6',
        'e6df78d7bc78790c3c65ee16241be7527670806d80d4f9c5512258e486e1d532',
        '524e438961dfcf4fca6554fda5a3e5437039cee20285f93a7d7fad2af6f47137',
        '623fa0c5f8d30ba38058cd8f6e844c27126f8696df5e7ff47ce84ccf0bbca316',
        '24c59b28c7c9115c05ea352477d7f0f16f15fbf0978558c55e04424662b7edb3',
        '4b0ae6d933d6f772313f644f842c10776e957f02890f45f0481b7a598be77356',
        'ecf87bdf577d09e4e56af5308fae95b9b3726618f3ffb7eab21b3f14031f5ef4',
    ],
};
