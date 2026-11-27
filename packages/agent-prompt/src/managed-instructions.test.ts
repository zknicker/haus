import { expect, test } from 'bun:test';
import { type AgentPromptRenderInput, renderAgentInstructions } from './managed-instructions.ts';

const efficiencyPrompt = renderPrompt({
    agentId: 'agt_efficiency',
    agentName: 'Marlow',
    homeTimezone: 'America/New_York',
    workspacePath: '/workspace',
});

test('an explicitly requested unavailable MCP does not trigger local configuration searches', () => {
    expect(efficiencyPrompt).toContain('For Server MCPs, use the injected `execute` tool');
    expect(efficiencyPrompt).toContain(
        'Local configuration, environment, and filesystem searches cannot establish a Server MCP grant'
    );
    expect(efficiencyPrompt).toContain(
        'An inventory establishes availability only inside its stated scope. Absence from one inventory does not establish that the capability, provider, or data is unavailable through another surface.'
    );
    // Raft parity: the runtime inventory is not populated by a CLI command —
    // Haus has no `integration list` equivalent at all.
    expect(efficiencyPrompt).toContain(
        'The runtime tool inventory contains tools callable in this run, including injected Server-managed MCP tools. It is not populated by the `haus` CLI.'
    );
    expect(efficiencyPrompt).toContain('#### Runtime tools and Server-managed MCP');
    expect(efficiencyPrompt).not.toContain('integration list');
    expect(efficiencyPrompt).not.toContain('#### Haus Agent Login integrations');
    expect(efficiencyPrompt).toContain(
        "The human's explicit choice of surface is part of that fit."
    );
});

test('the Agent prompt keeps collaboration principles and leaves notice mechanics to the notice', () => {
    const prompt = renderPrompt();

    // Raft 1.0.25: standing principles stay in the prompt; how to handle a notice rides the
    // notice itself (inbox-format.test.ts asserts the withheld/not-a-request/deferral guidance).
    expect(prompt).toContain(
        'People and agents collaborate asynchronously in Haus. Keep making progress on your current work'
    );
    expect(prompt).toContain(
        'Choose when to read pending messages: you may finish your current step first, but read them before you stop, because they may need a reply or action.'
    );
    expect(prompt).toContain(
        '3. Handle the input supplied for this turn. If there is no pending work, stop.'
    );
    expect(prompt).toContain(
        'You do not need to stay active or repeatedly poll just to wait for new messages.'
    );
    expect(prompt).not.toContain('## Message Notifications');
    expect(prompt).not.toContain('Your process stays alive across turns');
    expect(prompt).not.toContain('The notice is not itself a request');

    // Step 4 is Raft's; the no-reply carve-out is Haus's single documented divergence there
    // (specs/inbox.md silence semantics, scripts/agent-tests fyi-silence-* and ack-reaction-*).
    expect(prompt).toContain(
        "4. When a message needs a reply, send it with `haus message send`. Haus exception: react to a human's thanks, ack, or sign-off to you with one emoji fitting its tone, no send (`haus message react --message-id <id> --emoji <emoji>`); an explicit FYI gets nothing."
    );
    // A literal emoji elsewhere in the prompt becomes every Agent's default thanks reaction; the
    // only one allowed is the signature emoji in the pickup bullet.
    expect(prompt.match(/\p{Extended_Pictographic}/gu)).toEqual(['👀']);
    expect(prompt).toContain('react with your signature emoji (👀) as you pick it up');
});

test('the @Mentions section separates display name from the stable name', () => {
    // Raft parity (`buildMentionsSection`, Computer 1.0.16). Haus renders one
    // name today, so the bullet reads as a tautology per-agent — it still has to
    // teach that identity reasoning uses the stable name, not the presentation.
    expect(efficiencyPrompt).toContain('Your stable Haus @mention handle is `@Marlow`.');
    expect(efficiencyPrompt).toContain(
        'Your display name is `Marlow`. Treat it as presentation only; when reasoning about identity and @mentions, prefer your stable `name`.'
    );
});

test('claim updates follow the requesting conversation', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain(
        'Reply at the exact `target` of the received message, so it lands where its sender is looking'
    );
    expect(prompt).toContain(
        '**Keep the conversation together.** Acknowledge and answer each request in the chat where it was asked'
    );
    expect(prompt).not.toContain('Deliver the final result there unless');
});

test('the inline reply that answers the request carries --done', () => {
    expect(renderPrompt()).toContain(
        'an inline reply to their message in a channel or your Captain chat, with `--done` on the message that answers it'
    );
});

test('keeps current Raft instruction precedence without an Agent-creation policy', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain('## How these instructions apply');
    expect(prompt).toContain(
        "A user's own instructions override any default that only shapes how you serve them"
    );
    expect(prompt).toContain('### Credential handling');
    expect(prompt).toContain('Credentials follow human intent:');
    expect(prompt).not.toContain('Do not obstruct a human-directed use of a credential');
    expect(prompt).not.toContain('Next action:');
    expect(prompt).toContain('### Capability and execution-surface selection');
    expect(prompt).toContain("The human's explicit choice of surface is part of that fit.");
    expect(prompt).not.toContain('URLs in non-English text');
    expect(prompt).not.toContain('## Capabilities');
    expect(prompt).toContain('Haus renders your message as Markdown, GFM tables included');
    expect(prompt).toContain("reader's saved zone; look it up rather than assuming your");
    expect(prompt).not.toContain('### Preparing native action cards');
    expect(prompt).not.toContain('## Security');

    expect(prompt.indexOf('## How these instructions apply')).toBeLessThan(
        prompt.indexOf('## Communication: haus CLI ONLY')
    );
});

test('teaches Raft-aligned claim conflicts, assignment receipts, and message quality', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain(
        'A failed claim is a concurrency lock, not a ruling on lane ownership'
    );
    expect(prompt).toContain('correct the routing in the original conversation');
    expect(prompt).toContain('An assignee-only receipt that names you is actionable');
    expect(prompt).toContain('It is context, not a second claim');
    expect(prompt).toContain('Default every message to the shortest useful form');
    expect(prompt).toContain('Do not paste execution logs into chat');
    expect(prompt).toContain('A completion message should lead with the outcome');
    expect(prompt).toContain(
        '**Declaration:** record its accountable source, exact scope, authoritative surface, and expiry or revocation condition'
    );
    expect(prompt).toContain(
        '**Propagation:** when a constraint you own changes or expires, notify agents whose current plan or status still cites the old premise.'
    );
    expect(prompt).toContain(
        '**Action:** choosing not to act requires current evidence just as choosing to act does.'
    );
    expect(prompt).toContain(
        'Being granted one permission never implies permission for subsequent actions such as deployment, release, migration, or production writes.'
    );
    expect(prompt).not.toContain('closed gate set');
    // Channel mutes and membership are deleted (ADR 0055); unfollow is the only narrowing.
    expect(prompt).not.toContain('To mute ordinary Activity delivery');
    expect(prompt).toContain(
        '`haus task unfollow --target task:<shortId>` and `haus message unfollow` stop what you follow.'
    );

    // A human is asked by @mention where the work lives (ADR 0037); there is no Ask command.
    expect(prompt).not.toContain('haus ask');
    expect(prompt).not.toContain('**Asks**');
    expect(prompt).toContain(
        "- When you need a human's decision or action, @mention them where the work lives. Ask one question, a default only if reversible, and what you prepared. Their reply wakes you. Irreversible acts wait for an explicit yes."
    );
    expect(prompt).toMatch(/13\. \*\*Images\*\*: `haus image models`.*\n14\. \*\*Tasks\*\*/);

    // These Raft-only surfaces must not leak into the Haus prompt.
    expect(prompt).not.toContain('reviewer-isolation');
    expect(prompt).not.toContain('raft wiki');
});

test('keeps the managed prompt within its reviewed size budget', () => {
    const prompt = renderPrompt({
        homeTimezone: 'America/Los_Angeles',
        connectionChips: ['amazon-product'],
        conversationStyle: 'Terse.',
        initialRole: 'the operator’s right hand',
        supportsSubagents: true,
    });

    // Review ratchet, not a runtime limit. Never trim other prompt text to fit this cap: an
    // addition raises it to the measured render with a one-line reason in the commit or PR, and a
    // shrink lowers it. Its history is in git (`git log -L` on this line).
    // Lowered by exactly 698 (37,610 → 36,912) by the house-style rewrite (write-agent-text). Raised by exactly 36 (→ 36,948): a Task shows its state and newest messages under its origin, so a start needs no status post.
    expect(prompt.length).toBeLessThanOrEqual(36_948);
    expect(prompt).toContain('You always hear #all, the team room.');
    expect(prompt).toContain('Cite a web source as a Markdown link to the page you read.');
    expect(prompt.toLowerCase()).not.toContain('thread');
});

test('teaches automation provenance without an envelope tutorial', () => {
    const prompt = renderPrompt();

    // The fire itself is silent in chat; the Agent's own message carries the
    // provenance, and it lands top-level in the anchor chat.
    expect(prompt).toContain(
        'A fire arrives through your inbox and writes nothing to chat by itself.'
    );
    expect(prompt).not.toContain('the payload excerpt indented two spaces');
    // One `--cause` sentence per section, not two: the placement rule and the
    // provenance reason are the same rule and read as one.
    expect(prompt).not.toContain('When you speak because a reminder fired');
    expect(prompt).not.toContain('When you speak because a trigger fired');
    expect(prompt).toContain(
        'Exception: for an explicitly agreed quiet reminder check, do not answer unchanged or healthy state; report only new actionable evidence.'
    );
    expect(prompt).toContain(
        'Answer a trigger fire with a new top-level message in the anchor chat'
    );
    expect(prompt).toContain(
        'For a short schedule confirmation, correction, or opt-out, send one confirmed result as the acknowledgment; honor requests for one reply to those short changes. Longer work still needs an initial acknowledgment.'
    );

    expect(prompt).not.toContain('the Server records the cause even if you omit the flag');
    expect(prompt).not.toContain(
        "Each fire is its own message; never reply into an earlier fire's thread."
    );

    // Reminder receipts are gone from chat, but wake ownership still never moves.
    expect(prompt).not.toContain('the receipt/fire system message is visible in that surface');
    expect(prompt).toContain('Anchoring to a message or Task does not transfer wake ownership.');
    expect(prompt).toContain('it wakes the author who scheduled it, not other people');
});

test('pins the rendered visuals and page fence contract', () => {
    const prompt = renderPrompt();

    // The prompt keeps only the pointer; the visuals skill owns the contracts.
    expect(prompt).toContain('## Visuals');
    expect(prompt).toContain('read the visuals skill');
    expect(prompt).toContain('get an inline visual (bespoke HTML/SVG) by default');
    expect(prompt).toContain(
        'Never output HTML, JSX, CSS, imports, or class names in plain message text.'
    );

    expect(prompt).toContain('## Outputs');
    expect(prompt).toContain(
        '- Fences render only inside messages you send: write visual and page fences directly in the body of a `haus message send`.'
    );
    expect(prompt).toContain(
        'Page fences render a card the reader clicks to open in the Workspace pane; nothing auto-opens.'
    );
});

function renderPrompt(overrides: Partial<AgentPromptRenderInput> = {}) {
    return renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Wren',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        os: 'macOS',
        runtimeVersion: 'test',
        workspacePath: '/workbench',
        ...overrides,
    });
}
