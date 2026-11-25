import { expect, test } from 'bun:test';
import { stripProviderReferenceMarkers } from './provider-reference-markers.ts';

const open = String.fromCodePoint(0xe2_00);
const close = String.fromCodePoint(0xe2_01);
const separator = String.fromCodePoint(0xe2_02);
const cite = (id: string) => `${open}cite${separator}${id}${close}`;

test('a trailing citation marker leaves the sentence ending on its period', () => {
    expect(
        stripProviderReferenceMarkers(
            `January 15, 2027 is the next federal quarterly estimated-tax deadline, for the fourth payment toward your 2026 taxes. ${cite('turn751610search4')}`
        )
    ).toBe(
        'January 15, 2027 is the next federal quarterly estimated-tax deadline, for the fourth payment toward your 2026 taxes.'
    );
});

test('a marker before punctuation takes its leading space with it', () => {
    expect(
        stripProviderReferenceMarkers(
            `The fourth payment is due January 15, 2027 ${cite('turn751610search4')}, per the IRS ${cite('turn751610search1')}.`
        )
    ).toBe('The fourth payment is due January 15, 2027, per the IRS.');
});

test('a mid-sentence marker leaves one space between the words around it', () => {
    expect(
        stripProviderReferenceMarkers(`The IRS ${cite('turn751610search4')} lists four deadlines.`)
    ).toBe('The IRS lists four deadlines.');
});

test('adjacent markers collapse as one', () => {
    expect(
        stripProviderReferenceMarkers(
            `Due January 15 ${cite('turn0search1')} ${cite('turn0search4')}.\n- Next: April 15 ${cite('turn0search2')}`
        )
    ).toBe('Due January 15.\n- Next: April 15');
});

test('stray marker characters are dropped', () => {
    expect(stripProviderReferenceMarkers(`Due January 15${close}.`)).toBe('Due January 15.');
    expect(stripProviderReferenceMarkers(`Due ${separator} January${open} 15.`)).toBe(
        'Due January 15.'
    );
    expect(stripProviderReferenceMarkers(`${cite('turn0search0')} Due today.`)).toBe('Due today.');
});

test('a body without markers is returned unchanged, spacing included', () => {
    const body = 'Due  January 15 .\n\n```\nindent   kept \n```\n';
    expect(stripProviderReferenceMarkers(body)).toBe(body);
});

test('a body that was only markers becomes empty', () => {
    expect(stripProviderReferenceMarkers(` ${cite('turn0search0')} `).trim()).toBe('');
});
