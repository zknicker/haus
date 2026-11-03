import type { CliRenderer } from './render.ts';

/**
 * The haus-computer help surface: one command registry drives the global
 * help page, per-command pages, and incomplete/unknown command recovery.
 */

const commandGroups = ['Get started', 'Service', 'Inspect', 'Account'] as const;

type CommandGroup = (typeof commandGroups)[number];

export interface ComputerCommandHelp {
    args?: { name: string; summary: string }[];
    group: CommandGroup;
    name: string;
    notes?: string[];
    related?: { summary: string; usage: string }[];
    summary: string;
    usage: string;
}

const serverSlugArg = {
    name: '/server-slug',
    summary: 'Server address such as /hq — 2–32 lowercase letters, numbers, and hyphens',
};

export const computerCommands: ComputerCommandHelp[] = [
    {
        group: 'Service',
        name: 'workspace-migrate',
        summary: 'Remove the cap from one older Agent workspace',
        usage: 'workspace-migrate /server-slug <agent-id>',
        notes: [
            'Stop the whole Computer first. The original stays in workspace.backup.sparsebundle.',
        ],
    },
    {
        group: 'Service',
        name: 'workspace-compact',
        summary: 'Reclaim unused host blocks from one capped Agent workspace',
        usage: 'workspace-compact /server-slug <agent-id>',
        notes: ['Stop the whole Computer first and close any process using its workspace.'],
    },
    {
        args: [serverSlugArg],
        group: 'Get started',
        name: 'setup',
        notes: [
            'Signs you in with your browser when needed, then attaches this Computer.',
            'Re-running setup resumes a healthy attachment instead of creating a new one.',
        ],
        related: [{ summary: 'Attach with the saved login', usage: 'attach /server-slug' }],
        summary: 'Sign in and attach this Computer to a Server',
        usage: 'setup /server-slug',
    },
    {
        group: 'Get started',
        name: 'login',
        notes: ['--replace signs in again and replaces the saved login.'],
        summary: 'Sign in this Computer with your browser',
        usage: 'login [--replace]',
    },
    {
        args: [serverSlugArg],
        group: 'Get started',
        name: 'attach',
        related: [{ summary: 'Sign in and attach in one step', usage: 'setup /server-slug' }],
        summary: 'Attach to another Server using the saved login',
        usage: 'attach /server-slug',
    },
    {
        group: 'Service',
        name: 'start',
        summary: 'Start the Computer service, or one Server attachment',
        usage: 'start [/server-slug]',
    },
    {
        group: 'Service',
        name: 'stop',
        summary: 'Stop the Computer service, or one Server attachment',
        usage: 'stop [/server-slug]',
    },
    {
        args: [serverSlugArg],
        group: 'Service',
        name: 'restart',
        summary: 'Restart one Server attachment',
        usage: 'restart /server-slug',
    },
    {
        group: 'Service',
        name: 'install',
        summary: 'Install the resident background service',
        usage: 'install',
    },
    {
        group: 'Service',
        name: 'upgrade',
        notes: ['--rollback restores the previous verified executable.'],
        summary: 'Update to the latest release, or roll back',
        usage: 'upgrade [--rollback]',
    },
    {
        group: 'Inspect',
        name: 'status',
        summary: 'Show login, service, and Server attachment health',
        usage: 'status',
    },
    {
        group: 'Inspect',
        name: 'doctor',
        summary: 'Run Computer health checks',
        usage: 'doctor',
    },
    {
        args: [{ name: 'lines', summary: 'How many recent lines to show (default 200)' }],
        group: 'Inspect',
        name: 'logs',
        summary: 'Show recent service log lines',
        usage: 'logs [lines]',
    },
    {
        group: 'Inspect',
        name: 'version',
        notes: ['Prints machine-readable JSON identity when piped.'],
        summary: 'Show version identity',
        usage: 'version',
    },
    {
        group: 'Account',
        name: 'logout',
        summary: 'Sign out and stop this Computer',
        usage: 'logout',
    },
    {
        group: 'Account',
        name: 'configure-openrouter',
        notes: ['Pipe the key on stdin: pbpaste | haus-computer configure-openrouter'],
        summary: 'Save an OpenRouter management key from stdin',
        usage: 'configure-openrouter',
    },
];

export type ComputerHelpRequest =
    | { error?: string; kind: 'global' }
    | { command: ComputerCommandHelp; error?: string; kind: 'command' };

export function findComputerCommandHelp(name: string): ComputerCommandHelp | null {
    return computerCommands.find((command) => command.name === name) ?? null;
}

/** Maps explicit help invocations (bare, help, --help, -h) to a help page. */
export function resolveComputerHelpRequest(args: string[]): ComputerHelpRequest | null {
    const [command, target] = args;
    if (command === undefined || command === 'help' || command === '--help' || command === '-h') {
        if (command === 'help' && target !== undefined) {
            const found = findComputerCommandHelp(target);
            return found
                ? { command: found, kind: 'command' }
                : { error: `Unknown command "${target}".`, kind: 'global' };
        }
        return { kind: 'global' };
    }
    if (args.slice(1).some((argument) => argument === '--help' || argument === '-h')) {
        const found = findComputerCommandHelp(command);
        return found
            ? { command: found, kind: 'command' }
            : { error: `Unknown command "${command}".`, kind: 'global' };
    }
    return null;
}

export function renderComputerHelpPage(request: ComputerHelpRequest, render: CliRenderer): string {
    const body =
        request.kind === 'command'
            ? renderCommandPage(request.command, render)
            : renderGlobalPage(render);
    if (request.error) {
        return `${render.fail(request.error)}\n\n${body}`;
    }
    return body;
}

function renderGlobalPage(render: CliRenderer): string {
    const lines: string[] = [
        'Runs your Haus Agents on this machine and connects them to your Servers.',
        '',
        render.heading('Usage'),
        '  haus-computer <command> [arguments]',
    ];
    const width = Math.max(...computerCommands.map((command) => command.usage.length));
    for (const group of commandGroups) {
        lines.push('', render.heading(group));
        for (const command of computerCommands.filter((entry) => entry.group === group)) {
            lines.push(`  ${command.usage.padEnd(width + 4)}${command.summary}`);
        }
    }
    lines.push('', render.hint('Run haus-computer help <command> for details.'));
    return lines.join('\n');
}

function renderCommandPage(command: ComputerCommandHelp, render: CliRenderer): string {
    const lines: string[] = [
        `${render.heading('haus-computer')} ${render.heading(command.usage)}`,
        '',
        `${command.summary}.`,
    ];
    if (command.args && command.args.length > 0) {
        const width = Math.max(...command.args.map((argument) => argument.name.length));
        lines.push('', render.heading('Arguments'));
        for (const argument of command.args) {
            lines.push(`  ${argument.name.padEnd(width + 4)}${argument.summary}`);
        }
    }
    if (command.notes && command.notes.length > 0) {
        lines.push('', render.heading('Notes'));
        for (const note of command.notes) {
            lines.push(`  ${note}`);
        }
    }
    if (command.related && command.related.length > 0) {
        const width = Math.max(...command.related.map((entry) => entry.usage.length));
        lines.push('', render.heading('Related'));
        for (const entry of command.related) {
            lines.push(`  haus-computer ${entry.usage.padEnd(width + 4)}${entry.summary}`);
        }
    }
    return lines.join('\n');
}
