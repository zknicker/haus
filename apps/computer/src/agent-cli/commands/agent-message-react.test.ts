import { expect, test } from 'bun:test';
import { MESSAGE_SUBCOMMANDS } from './agent-message.ts';

test('react help teaches acknowledgement without anchoring on one emoji', () => {
    const react = MESSAGE_SUBCOMMANDS.find((subcommand) => subcommand.name === 'react');

    expect(react?.summary).toBe(
        "Acknowledge a human's message that needs no reply instead of sending one; never react to routine events"
    );
    expect(react?.flags.find((flag) => flag.name === '--emoji')?.description).toBe(
        'Exactly one emoji that fits the message'
    );
    // A literal emoji in help becomes every Agent's default reaction.
    expect(JSON.stringify(react)).not.toMatch(/\p{Extended_Pictographic}/u);
});
