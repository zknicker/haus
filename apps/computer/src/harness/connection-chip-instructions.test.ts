import { expect, test } from 'bun:test';
import { composeAgentInstructions } from './instructions.ts';

const facts = {
    agentId: 'agt_cove',
    agentName: 'Cove',
    homeTimezone: 'America/Los_Angeles',
    initialRole: null,
    runtimeId: 'codex',
    workspacePath: '/home/agt_cove/workspace',
} as const;
const amazonRef =
    "- B07XN9T11R: an Amazon ASIN renders as a product chip; write it beside a product's name whenever you name one";

test('the ASIN ref joins the Formatting refs only while the Server provides product chips', () => {
    const prompt = (connectionChips: ('amazon-product' | 'linear-issue')[]) =>
        composeAgentInstructions({ ...facts, connectionChips }).instructions;

    expect(prompt([])).not.toContain('B07XN9T11R');
    expect(prompt(['linear-issue'])).not.toContain('B07XN9T11R');
    expect(prompt(['amazon-product'])).toContain(
        `ambiguous with other references)\n${amazonRef}\n\nWrite them inline`
    );
});

test('connecting RankWrangler changes the fingerprint, so the ref reaches the next start', () => {
    const plain = composeAgentInstructions(facts);
    const chipped = composeAgentInstructions({ ...facts, connectionChips: ['amazon-product'] });

    expect(chipped.fingerprint).not.toBe(plain.fingerprint);
    expect(composeAgentInstructions({ ...facts, connectionChips: [] }).fingerprint).toBe(
        plain.fingerprint
    );
});
