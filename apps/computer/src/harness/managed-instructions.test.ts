import { expect, test } from 'bun:test';
import { type AgentPromptRenderInput, renderAgentInstructions } from './managed-instructions.ts';

const efficiencyPrompt = renderPrompt({
    agentId: 'agt_efficiency',
    agentName: 'Marlow',
    homeTimezone: 'America/New_York',
    workspacePath: '/workspace',
});

test('each turn reads current memory while compaction recovery remains required', () => {
    expect(efficiencyPrompt).toContain(
        '2. Read MEMORY.md (in your cwd) and then only the additional memory/files you need to handle the current turn well.'
    );
    expect(efficiencyPrompt).toContain('including after context compression');
    expect(efficiencyPrompt).toContain(
        'Your session resets rarely, so reading it only at startup is not enough.'
    );
    expect(efficiencyPrompt).not.toContain('skip routine follow-up rereads');
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
        'unread messages do not mean there is no work, and each notice does not require an immediate interruption.'
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
    // A literal emoji anywhere in the prompt becomes every Agent's default reaction.
    expect(prompt).not.toMatch(/\p{Extended_Pictographic}/u);
});

test('the @Mentions section separates display name from the stable name', () => {
    // Raft parity (`buildMentionsSection`, Computer 1.0.16). Haus renders one
    // name today, so the bullet reads as a tautology per-agent — it still has to
    // teach that identity reasoning uses the stable name, not the presentation.
    expect(efficiencyPrompt).toContain('Your stable Haus @mention handle is `@Marlow`.');
    expect(efficiencyPrompt).toContain(
        'Your display name is `Marlow`. Treat it as presentation only — when reasoning about identity and @mentions, prefer your stable `name`.'
    );
});

test('task updates follow the requesting conversation', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain(
        'To reply to any message, always reuse the exact `target` from the received message.'
    );
    expect(prompt).toContain(
        '**Keep the conversation together.** Acknowledge and answer each request in the chat or thread where it was asked'
    );
    expect(prompt).not.toContain('Deliver the final result there unless');
});

test('the final reply in a chat carries --done and interim posts do not', () => {
    expect(renderPrompt()).toContain(
        'Add `--done` to the message that completes your reply; interim posts omit it.'
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
    expect(prompt).not.toContain('### Formatting — URLs in non-English text');
    expect(prompt).not.toContain('## Capabilities');
    expect(prompt).toContain('Haus renders your message as Markdown, GFM tables included');
    expect(prompt).not.toContain('### Preparing native action cards');
    expect(prompt).not.toContain('## Security');

    expect(prompt.indexOf('## How these instructions apply')).toBeLessThan(
        prompt.indexOf('## Communication — haus CLI ONLY')
    );
});

test('teaches Raft-aligned claim conflicts, assignment receipts, and message quality', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain(
        'A failed claim is a concurrency lock, not a ruling on lane ownership'
    );
    expect(prompt).toContain('correct the routing in the original thread');
    expect(prompt).toContain('An assignee-only receipt that names you is actionable');
    expect(prompt).toContain('It is context, not a second task');
    expect(prompt).toContain('run `haus message read --target "#channel:shortid"` before replying');
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
    expect(prompt).toContain(
        'To mute ordinary Activity delivery from a regular channel itself without leaving'
    );
    expect(prompt).toContain('and threads you follow keep delivering independently');
    expect(prompt).toContain(
        'A parent channel mute does not suppress ordinary delivery from threads you follow'
    );
    expect(prompt).not.toContain(
        'A parent channel mute already suppresses ordinary delivery from its threads'
    );

    // A human is asked by @mention where the work lives (ADR 0037); there is no Ask command.
    expect(prompt).not.toContain('haus ask');
    expect(prompt).not.toContain('**Asks**');
    expect(prompt).toContain(
        "- When you need a human's decision or action, @mention them where the work lives. Ask one question, a default only if reversible, and what you prepared. Their reply wakes you. Irreversible acts wait for an explicit yes."
    );
    expect(prompt).toContain('12. **Cloud agents**');
    expect(prompt).toContain('13. **Manual**');

    // These Raft-only surfaces must not leak into the Haus prompt.
    expect(prompt).not.toContain('reviewer-isolation');
    expect(prompt).not.toContain('raft wiki');
});

test('keeps the managed prompt within its reviewed size budget', () => {
    const prompt = renderPrompt({
        homeTimezone: 'America/Los_Angeles',
        initialRole: 'the operator’s right hand',
        webAccess: 'search',
    });

    // A reviewed ratchet, not a runtime limit: no adapter enforces a prompt length. Haus tracks
    // the current Raft release from source. Raft-verbatim text is text present in the current Raft
    // prompt at the source commit pinned in specs/raft-alignment/prompt-divergences.md; it is
    // never trimmed to make room. When Raft deletes a clause, the Haus copy becomes Haus-only and
    // must justify itself. Haus-only additions fit by simplifying or relocating other Haus-only
    // text (Manual topics, skills, event input); raising the budget for them needs an operator
    // decision. See AGENTS.md "Agent System Prompt Changes".
    //
    // Lowered from 40,270 on the Raft 1.0.25 re-baseline (render 40,270 → 32,359): notice
    // mechanics moved into the inbox notice, task mechanics into the `tasks` Manual topic, and
    // clauses Raft deleted were cut. Raised by exactly 42 when Haus gained task assign/unassign
    // and restored Raft's `task assign` / `task unassign` family entries (32,359 → 32,401).
    // Lowered when Asks were deleted (ADR 0037): the `haus ask` family entry gave way to one
    // shorter Haus-only @mention rule in `## @Mentions` (32,401 → 32,395). Ratcheted to the
    // measured render (32,395 → 32,393) when that rule learned to mention even the asker, paid for by
    // cutting the capability section's redundant surface bullet. Lowered (32,393 → 32,281) when an
    // inline reply to a human's message came to address them like a mention, so the
    // "even when replying to whoever asked" clause was cut. Lowered (32,281 → 32,220) when step 4 and the
    // DM silence rule came to require one acknowledgement reaction whose emoji fits the message,
    // paid for by relocating the Cloud agents section's `cloud-agent send` and work-thread
    // sentences to the `cloud-agents` Manual topic. Raised by operator decision (32,220 → 32,444)
    // when the Formatting section gained a chat-register rule against bold-as-emphasis and
    // structure-only lists, headings, and tables. Lowered (32,444 → 32,416) when Sending messages
    // moved solo step-by-step progress into a thread on the acknowledgment (ADR 0029 amendment,
    // 2026-10-02), paid for by relocating the Cloud agents section's requester-update and
    // work-thread sentences to the `cloud-agents` Manual topic and shortening the Tasks
    // conversation rule.
    expect(prompt.length).toBeLessThanOrEqual(32_416);
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
    expect(
        prompt.match(
            /Answer a fire with a new top-level message in the anchor chat, sent with `--cause <fireId>` so the message carries its provenance; never as a reply in any thread, even a thread you were already working in\./gu
        )
    ).toHaveLength(2);
    expect(prompt).not.toContain('the Server records the cause even if you omit the flag');
    expect(prompt).not.toContain(
        "Each fire is its own message; never reply into an earlier fire's thread."
    );

    // Reminder receipts are gone from chat, but wake ownership still never moves.
    expect(prompt).not.toContain('the receipt/fire system message is visible in that surface');
    expect(prompt).toContain('Anchoring to a message or thread does not transfer wake ownership.');
    expect(prompt).toContain('it wakes the author who scheduled it, not other people');
});

test('pins the rendered visuals and artifact fence contract', () => {
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
        '- Fences render only inside messages you send: write visual and artifact fences directly in the body of a `haus message send`.'
    );
    expect(prompt).toContain(
        'Artifact fences render a card the reader clicks to open in the artifact pane; nothing auto-opens.'
    );
});

test('teaches a chat register for Markdown formatting', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain(
        'Haus renders your message as Markdown, GFM tables included, but it is a chat: write like a teammate messaging, in plain sentences.'
    );
    expect(prompt).toContain(
        "Don't bold for emphasis or as labels; use lists, headings, or tables only when the content is genuinely structured, such as steps, comparisons, or data."
    );
});

function renderPrompt(overrides: Partial<AgentPromptRenderInput> = {}) {
    return renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Cove',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        os: 'macOS',
        runtimeVersion: 'test',
        webAccess: null,
        workspacePath: '/workbench',
        ...overrides,
    });
}
