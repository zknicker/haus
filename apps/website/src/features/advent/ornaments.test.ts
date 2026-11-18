import { expect, test } from 'bun:test';
import { adventFacts } from '@haus/api';
import { dayOrnament, factOrnament, ornamentArt } from './ornaments.ts';

test('every fact has painted art', () => {
    for (const fact of adventFacts) {
        expect(ornamentArt[factOrnament[fact]]).toBeString();
    }
});

test('each of the 24 doors shows a different ornament', () => {
    const ornaments = adventFacts.map((fact) => factOrnament[fact]);
    expect(ornaments).toHaveLength(24);
    expect(new Set(ornaments).size).toBe(24);
});

test('the ornament fits the fact', () => {
    expect(factOrnament['busiest-hour']).toBe('bell');
    expect(factOrnament['files-shared']).toBe('present-green');
    expect(factOrnament['tokens-used']).toBe('lantern');
    expect(factOrnament.recap).toBe('star');
});

test('door N shows the Nth fact', () => {
    expect(dayOrnament(1)).toBe(factOrnament['messages-sent']);
    expect(dayOrnament(24)).toBe('star');
});
