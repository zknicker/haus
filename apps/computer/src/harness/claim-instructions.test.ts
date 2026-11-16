import { expect, test } from 'bun:test';
import { CLAIM_IN_REVIEW_STALE_DAYS } from '@haus/api';
import { composeAgentInstructions } from './instructions.ts';

const facts = {
    agentId: 'agt_cove',
    agentName: 'Cove',
    homeTimezone: 'America/Los_Angeles',
    initialRole: 'the operator’s right hand',
    runtimeId: 'codex',
    workspacePath: '/home/agt_cove/workspace',
} as const;

// Raft 1.0.25 `### Tasks`, which Haus calls `### Claims` (ADR 0051): the claim rule gates
// anything that needs action beyond a reply, so a second Agent cannot start work another Agent
// already holds. Haus keeps `closed`, the stale-close window, and conversation routing, and
// diverges on finishing: Agents set their own work `done`; mechanics live in the Manual.
test('claims before acting and finishes its own work without parking it', () => {
    const { instructions } = composeAgentInstructions(facts);

    // Raft's claim rule, verbatim apart from the product noun.
    expect(instructions).toContain(
        '**Claim rule:** if fulfilling a message requires you to take action beyond just replying (running tools, making changes, investigating), use `haus claim` before starting.'
    );
    expect(instructions).toContain(
        "If you're only answering a question or having a conversation, no claim is needed."
    );

    // The retired "never claim a same-turn request" carve-out must stay gone:
    // it let an unaddressed Agent execute work another Agent was asked to do.
    expect(instructions).not.toContain('never claim, never promote');
    expect(instructions).not.toContain('**Promotion rule:**');
    expect(instructions).not.toContain('a same-turn request is never claimed or promoted');

    // Haus's own status set and stale window survive as additive text.
    expect(instructions).toContain('Haus adds `closed` (reversible)');
    // Done by default; `in_review` only for requested sign-off or a pending human decision,
    // and then the Agent names what the human must check (operator decision, 2026-10-05).
    expect(instructions).toContain('When your work is done, set the claim to `done` yourself.');
    expect(instructions).toContain(
        'Use `in_review` only when the requester asked to sign off on the result or the work needs a human decision before it counts as finished'
    );
    expect(instructions).toContain('say in the conversation what they need to check.');
    expect(instructions).not.toContain('so a human can validate it, then to `done` after approval');
    expect(instructions).toContain(
        "**Keep the conversation together.** Acknowledge and answer each request in the chat or thread where it was asked, following the human's lead as the conversation develops."
    );
    expect(instructions).toContain(
        `An \`in_review\` claim whose conversation stays silent for ${CLAIM_IN_REVIEW_STALE_DAYS} days is closed as stale by the Server, so keep pending reviews current in their conversation.`
    );
    expect(instructions).toContain('live in the `claims` Manual topic');
});
