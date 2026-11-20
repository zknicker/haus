import { describe, expect, test } from 'bun:test';
import { commandGroups } from '@haus/computer/src/agent-cli.ts';
import { hausCommandAccess } from './command-access.ts';

describe('hausCommandAccess', () => {
    test('classifies every Agent CLI command', () => {
        const unclassified = Object.entries(commandGroups)
            .flatMap(([group, subcommands]) =>
                subcommands.map((subcommand) => [
                    group,
                    subcommand.bare ? '--target' : subcommand.name,
                ])
            )
            .filter((argv) => {
                const access = hausCommandAccess(argv);
                return access.kind === 'refused' && access.text.includes('UNKNOWN_HAUS_COMMAND');
            });

        expect(unclassified).toEqual([]);
    });

    test.each([[[]], [['help']], [['--version']], [['files']], [['files', '--help']]])(
        'lets help through: %j',
        (argv) => {
            expect(hausCommandAccess(argv)).toEqual({ kind: 'run', machineFlags: [] });
        }
    );

    test.each([
        [['files', 'sync'], 'Run `haus files --help` for its commands.'],
        [['files', 'constructor'], 'Run `haus files --help` for its commands.'],
        [['drive', 'push'], 'Run `haus help` for the command list.'],
        [['toString', 'call'], 'Run `haus help` for the command list.'],
    ])('refuses a command it does not know: %j', (argv, nextAction) => {
        expect(hausCommandAccess(argv)).toEqual({
            kind: 'refused',
            text: `Error: \`haus ${argv.join(' ')}\` is not a haus command.\nCode: UNKNOWN_HAUS_COMMAND\nNext action: ${nextAction}`,
        });
    });
});
