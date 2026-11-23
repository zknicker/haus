import { expect, test } from 'bun:test';
import { appearanceChange } from './appearance-change.ts';

test('a color pick saves only the color', () => {
    expect(
        appearanceChange({ color: 'blue', icon: 'rocket' }, { color: 'green', icon: 'rocket' })
    ).toEqual({ color: 'green' });
});

test('a quick icon pick after a color pick saves only the icon, so the color stays', () => {
    const saved = { color: 'blue', icon: 'rocket' };
    const afterColor = { color: 'green', icon: 'rocket' };
    const afterIcon = { color: 'green', icon: 'leaf' };

    expect(appearanceChange(saved, afterColor)).toEqual({ color: 'green' });
    expect(appearanceChange(afterColor, afterIcon)).toEqual({ icon: 'leaf' });
});

test('clearing a field saves the null', () => {
    expect(
        appearanceChange({ color: 'blue', icon: 'rocket' }, { color: null, icon: 'rocket' })
    ).toEqual({ color: null });
});

test('an unchanged pick saves nothing', () => {
    expect(appearanceChange({ color: 'blue', icon: null }, { color: 'blue', icon: null })).toEqual(
        {}
    );
});
