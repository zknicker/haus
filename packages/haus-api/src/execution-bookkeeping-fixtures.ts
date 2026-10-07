/**
 * Journal tool calls with the bookkeeping verdict both readers must agree on:
 * the App's turn trace (`isBookkeeping`) and the Computer's execution outline
 * (step kind `bookkeeping`). Each side's tests run every case.
 */
export interface ExecutionBookkeepingCase {
    readonly bookkeeping: boolean;
    readonly input: unknown;
    readonly name: string;
    readonly toolName: string;
}

const workspace = '/Users/someone/.haus/computer/servers/srv_1/agents/agt_1/workspace';

export const executionBookkeepingCases: readonly ExecutionBookkeepingCase[] = [
    {
        bookkeeping: true,
        input: {
            command: "haus message send --done --target dm:@zach <<'HAUSMSG'\nShipped it.\nHAUSMSG",
        },
        name: 'a done message send with a heredoc body',
        toolName: 'Bash',
    },
    {
        bookkeeping: true,
        input: { command: ['/bin/zsh', '-lc', 'haus task claim --number 1'] },
        name: "a task claim in a runtime's argv wrapper",
        toolName: 'exec',
    },
    {
        bookkeeping: true,
        input: { command: 'cd projects/app && haus react --message-id m_1 --emoji eyes' },
        name: 'a reaction after setup',
        toolName: 'Bash',
    },
    {
        bookkeeping: true,
        input: JSON.stringify({ command: 'haus reminder create --help 2>&1 | head -5' }),
        name: 'piped haus help, as JSON input',
        toolName: 'shell',
    },
    {
        bookkeeping: false,
        input: { command: 'haus task update --status done && bun test' },
        name: 'haus beside real work',
        toolName: 'Bash',
    },
    {
        bookkeeping: false,
        input: { command: 'echo done > notes.md' },
        name: 'a redirect that writes a file',
        toolName: 'Bash',
    },
    {
        bookkeeping: true,
        input: { file_path: 'MEMORY.md' },
        name: 'reading MEMORY.md',
        toolName: 'Read',
    },
    {
        bookkeeping: true,
        input: { file_path: `${workspace}/MEMORY.md`, new_string: 'b', old_string: 'a' },
        name: "editing a sub-agent's absolute MEMORY.md",
        toolName: 'Edit',
    },
    {
        bookkeeping: false,
        input: { file_path: 'docs/MEMORY.md' },
        name: 'a nested MEMORY.md',
        toolName: 'Read',
    },
    {
        bookkeeping: true,
        input: { text: 'On it.' },
        name: 'a native message send',
        toolName: 'send_message',
    },
    {
        bookkeeping: false,
        input: { path: 'MEMORY.md' },
        name: 'an unknown tool that names MEMORY.md',
        toolName: 'spreadsheet',
    },
];
