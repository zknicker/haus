import { expect, test } from 'bun:test';
import { renderAgentInstructions } from './managed-instructions.ts';

test('the Inbox family entry teaches the unread-conversation list in Raft 26f77ef wording', () => {
    const prompt = renderPrompt();

    expect(prompt).toContain(
        '4. **Inbox**: `haus inbox check` is your Inbox: it lists your unread conversations (DMs, channels, threads), newest activity first. Each row prints the `haus message read` command that opens it, and the output ends with one `Next:` step. No flags needed; `--view mentions` narrows to conversations that mention you, and `--before <seq>` from the `More:` line pages.'
    );
});

function renderPrompt() {
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
    });
}
