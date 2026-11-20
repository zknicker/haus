import { expect, test } from 'bun:test';
import { noCaptainTooltip } from './capy-sidebar-header.tsx';

test('New task with no Captain points Owners to Home and Members to an Owner', () => {
    expect(noCaptainTooltip(true)).toBe('New task needs a Captain. Add one from Home.');
    expect(noCaptainTooltip(false)).toBe(
        'New task needs a Captain. Ask an Owner or Admin to add one.'
    );
});
