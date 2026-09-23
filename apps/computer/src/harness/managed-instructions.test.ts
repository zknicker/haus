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

test('the Agent prompt preserves the notice-to-pull contract', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain('The notice is not itself a request');
    expect(prompt).toContain('`haus message check` reads locally cached bodies');
    expect(prompt).toContain('Deferral needs no visible reply');
    expect(prompt).toContain('Your process stays alive across turns');

    // Raft parity (startup step 3, Computer 1.0.16): the honest-deferral clause
    // and the stay-alive delivery sentence are load-bearing, not decoration.
    expect(prompt).toContain('their bodies are withheld to avoid flooding you, not absent');
    expect(prompt).toContain(
        'if you choose not to read, that is a deferral to report honestly, not a conclusion that nothing is pending'
    );
    expect(prompt).toContain(
        'New messages may be delivered to you automatically while your process stays alive.'
    );

    // Raft parity (startup step 4): processing and replying are one act; the
    // FYI carve-out is Haus's single documented divergence there
    // (specs/inbox.md silence semantics, scripts/agent-tests fyi-silence-*).
    expect(prompt).toContain(
        'When you receive a message, process it and reply with `haus message send`.'
    );
    expect(prompt).toContain(
        'an explicit FYI / no-response-needed message settles silently, with no send at all'
    );
});

test('only a runtime that can steer a live turn is promised mid-turn notices', () => {
    // Raft's per-driver variants: `direct` for stdin-capable drivers, no notification section
    // and a next-turn delivery sentence otherwise. Wake notices reach every runtime, so step 3
    // keeps its notice handling either way.
    const midTurn = renderPrompt({ midTurnNotices: true });
    const nextTurn = renderPrompt({ midTurnNotices: false });

    expect(midTurn).toContain('## Message Notifications');
    expect(midTurn).toContain('into your current turn');
    expect(nextTurn).not.toContain('## Message Notifications');
    expect(nextTurn).not.toContain('into the current turn');
    expect(nextTurn).not.toContain('into your current turn');
    expect(nextTurn).not.toContain('while your process stays alive');
    expect(nextTurn).toContain(
        'If there is neither a concrete message nor an inbox notice, stop and wait. Haus will automatically start a new turn when new messages arrive.'
    );
    expect(nextTurn).toContain(
        'messages that arrive while you are working are delivered at the start of your next turn'
    );
    for (const prompt of [midTurn, nextTurn]) {
        expect(prompt).toContain('The notice is not itself a request, so do not acknowledge it.');
        expect(prompt).toContain(
            'if you choose not to read, that is a deferral to report honestly'
        );
    }
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
        '3. **Keep the conversation together.** Continue each request in the chat or thread where it was asked'
    );
    expect(prompt).not.toContain('Deliver the final result there unless');
});

test('keeps current Raft instruction precedence without an Agent-creation policy', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain('## How these instructions apply');
    expect(prompt).toContain(
        "A user's own instructions override any default that only shapes how you serve them"
    );
    expect(prompt).toContain('### Credential handling');
    expect(prompt).toContain('Credentials follow human intent.');
    expect(prompt).toContain('### Capability and execution-surface selection');
    expect(prompt).toContain("The human's explicit choice of surface is part of that fit.");
    expect(prompt).toContain('### Formatting — URLs in non-English text');
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
        'Merge authority never implies deployment, release, migration, production-write, or other follow-on authority.'
    );
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

    expect(prompt).toContain('**Asks** — `haus ask`');
    expect(prompt).toContain('the answer is their reply in the Ask’s thread');

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

    // A reviewed ratchet, not a runtime limit: no adapter enforces a prompt length. Raft-verbatim
    // text is fixed and is never trimmed to make room; Haus-only additions must fit by
    // simplifying or relocating other Haus-only text (Manual topics, skills). See AGENTS.md
    // "Agent System Prompt Changes" and specs/raft-alignment/prompt-divergences.md.
    //
    // Raised from 40,000 to buy the new-teammate welcome etiquette bullet. It has no Manual
    // topic to live in: it fires on a creation announcement every Agent in #all reads, not on
    // a verb an Agent looks up, so relocating it would silence it. The bullet is already
    // trimmed to its substance and the retired `action prepare` / `avatar generate` lines paid
    // back what they could.
    expect(prompt.length).toBeLessThanOrEqual(40_200);
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

function renderPrompt(overrides: Partial<AgentPromptRenderInput> = {}) {
    return renderAgentInstructions({
        agentId: 'agt_prompt_test',
        agentName: 'Cove',
        homeTimezone: 'UTC',
        hostname: 'computer.test',
        initialRole: null,
        midTurnNotices: true,
        os: 'macOS',
        runtimeVersion: 'test',
        webAccess: null,
        workspacePath: '/workbench',
        ...overrides,
    });
}
