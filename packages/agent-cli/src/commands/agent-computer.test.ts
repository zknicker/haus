import { expect, test } from 'bun:test';
import { commandGroups } from '../agent-cli.ts';
import { renderComputerList } from './agent-computer.ts';

const studio = `cmp_${'s'.repeat(16)}`;
const macbook = `cmp_${'m'.repeat(16)}`;
const mini = `cmp_${'n'.repeat(16)}`;

test('the computer family lists', () => {
    expect(commandGroups.computer.map((sub) => sub.name)).toEqual(['list']);
});

test('computer list shows each Computer with its state, OS, access, and computer use, then how to target one', () => {
    expect(
        renderComputerList({
            computers: [
                {
                    allowed: true,
                    computerId: studio,
                    computerUse: true,
                    home: true,
                    name: 'Studio',
                    online: true,
                    operatingSystem: 'macOS',
                },
                {
                    allowed: true,
                    computerId: macbook,
                    computerUse: false,
                    home: false,
                    name: 'MacBook',
                    online: false,
                    operatingSystem: 'macOS',
                },
                {
                    allowed: false,
                    computerId: mini,
                    computerUse: false,
                    home: false,
                    name: null,
                    online: true,
                    operatingSystem: null,
                },
            ],
        })
    ).toBe(
        [
            `Studio (${studio}) · online · macOS · home · computer use`,
            `MacBook (${macbook}) · offline · macOS · allowed`,
            `Unnamed (${mini}) · online · no access`,
            '',
            'Target one with the `computer` field (its name or id) on a bash, shell, edit, view_image, or execute call. Without it, tools run on your home Computer.',
            '',
        ].join('\n')
    );
});

test('computer list says so when the Server has no Computers', () => {
    expect(renderComputerList({ computers: [] })).toBe(
        'No Computers are attached to this Server.\n'
    );
});
