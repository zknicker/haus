import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import type { MessageClaim } from './claim-presentation.ts';
import { MessageClaimChip } from './message-claim-chip.tsx';

test('the chip leads with the number and names the assignee', () => {
    const html = renderToStaticMarkup(
        <MessageClaimChip
            assigneeProfile={{ avatarUrl: null, name: 'Blippy' }}
            claim={claim({ status: 'in_progress' })}
        />
    );

    expect(html).toContain('Claim #7');
    expect(html).toContain('Blippy');
    // The status is a disc, so the word itself has to reach a screen reader.
    expect(html).toContain('In progress');
    // The assignee is the only part that gives way when the row runs out of room.
    expect(html).toContain('truncate');
});

test('an unassigned claim states itself without inventing an owner', () => {
    const html = renderToStaticMarkup(<MessageClaimChip claim={claim({ assignee: null })} />);

    expect(html).toContain('Claim #7');
    expect(html).toContain('Todo');
});

test('an assignee with no resolved profile falls back to their handle', () => {
    const html = renderToStaticMarkup(<MessageClaimChip claim={claim({})} />);

    expect(html).toContain('@ada');
});

function claim(overrides: Partial<MessageClaim>): MessageClaim {
    return {
        assignee: { handle: 'ada', id: 'agt_ada', kind: 'agent' },
        live: false,
        number: 7,
        status: 'todo',
        tier: 'tracked',
        ...overrides,
    };
}
