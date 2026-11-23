import { describe, expect, test } from 'bun:test';
import { commandGroups } from '@haus/agent-cli';
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

    test('runs `haus computer list` in Haus with no machine paths', () => {
        expect(hausCommandAccess(['computer', 'list'])).toEqual({ kind: 'run', machineFlags: [] });
        expect(hausCommandAccess(['computer', 'use'])).toMatchObject({
            kind: 'refused',
            text: expect.stringContaining('UNKNOWN_HAUS_COMMAND'),
        });
    });

    test.each([[[]], [['help']], [['--version']], [['drive']], [['drive', '--help']]])(
        'lets help through: %j',
        (argv) => {
            expect(hausCommandAccess(argv)).toEqual({ kind: 'run', machineFlags: [] });
        }
    );

    test.each([
        [['drive', 'push'], 'Run `haus drive --help` for its commands.'],
        [['drive', 'constructor'], 'Run `haus drive --help` for its commands.'],
        [['files', 'push'], 'Run `haus help` for the command list.'],
        [['toString', 'call'], 'Run `haus help` for the command list.'],
    ])('refuses a command it does not know: %j', (argv, nextAction) => {
        expect(hausCommandAccess(argv)).toEqual({
            kind: 'refused',
            text: `Error: \`haus ${argv.join(' ')}\` is not a haus command.\nCode: UNKNOWN_HAUS_COMMAND\nNext action: ${nextAction}`,
        });
    });
});
