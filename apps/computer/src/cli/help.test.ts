import { expect, test } from 'bun:test';
import {
    computerCommands,
    findComputerCommandHelp,
    renderComputerHelpPage,
    resolveComputerHelpRequest,
} from './help.ts';
import { createCliRenderer } from './render.ts';

const render = createCliRenderer({ colors: false });

test('bare, help, --help, and -h all resolve to the global page', () => {
    for (const args of [[], ['help'], ['--help'], ['-h']]) {
        expect(resolveComputerHelpRequest(args)).toEqual({ kind: 'global' });
    }
});

test('help <command> and <command> --help resolve to the command page', () => {
    const byName = resolveComputerHelpRequest(['help', 'attach']);
    expect(byName?.kind).toBe('command');
    const byFlag = resolveComputerHelpRequest(['attach', '--help']);
    expect(byFlag?.kind).toBe('command');
    const byShortFlag = resolveComputerHelpRequest(['upgrade', '-h']);
    expect(byShortFlag?.kind).toBe('command');
});

test('unknown help targets fall back to the global page with an error', () => {
    const request = resolveComputerHelpRequest(['help', 'teleport']);
    expect(request).toEqual({ error: 'Unknown command "teleport".', kind: 'global' });
});

test('ordinary commands resolve to no help request', () => {
    expect(resolveComputerHelpRequest(['status'])).toBeNull();
    expect(resolveComputerHelpRequest(['setup', '/hq'])).toBeNull();
    expect(resolveComputerHelpRequest(['upgrade', '--rollback'])).toBeNull();
});

test('the global page lists every registered command with its summary', () => {
    const page = renderComputerHelpPage({ kind: 'global' }, render);
    for (const command of computerCommands) {
        expect(page).toContain(command.usage);
        expect(page).toContain(command.summary);
    }
    expect(page).toContain('Usage');
    expect(page).toContain('haus-computer <command> [arguments]');
    expect(page).toContain('Run haus-computer help <command> for details.');
});

test('a command page shows usage, arguments, notes, and related commands', () => {
    const setup = findComputerCommandHelp('setup');
    expect(setup).not.toBeNull();
    if (!setup) {
        return;
    }
    const page = renderComputerHelpPage({ command: setup, kind: 'command' }, render);
    expect(page).toContain('haus-computer setup /server-slug');
    expect(page).toContain('/server-slug');
    expect(page).toContain('Notes');
    expect(page).toContain('haus-computer attach /server-slug');
});

test('an error line leads the page with a failure glyph', () => {
    const page = renderComputerHelpPage(
        { error: 'Unknown command "teleport".', kind: 'global' },
        render
    );
    expect(page.startsWith('✗ Unknown command "teleport".')).toBe(true);
});

test('internal command surfaces are not documented', () => {
    for (const name of ['__agent', '__attachment-daemon', '__release-check']) {
        expect(findComputerCommandHelp(name)).toBeNull();
    }
});
