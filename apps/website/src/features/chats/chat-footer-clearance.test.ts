import { expect, test } from 'bun:test';
import { chatFooterClearance } from './chat-footer-clearance.ts';

test('a footer without a rising stack clears its own height', () => {
    expect(chatFooterClearance({ footerBottom: 800, footerTop: 720 })).toBe(80);
});

test('a stack rising above the footer extends the clearance to its top', () => {
    expect(chatFooterClearance({ footerBottom: 800, footerTop: 720, stackTop: 668 })).toBe(132);
});

test('a stack inside the footer box does not shrink the clearance', () => {
    expect(chatFooterClearance({ footerBottom: 800, footerTop: 720, stackTop: 740 })).toBe(80);
});

test('fractional layout rounds up and never goes negative', () => {
    expect(chatFooterClearance({ footerBottom: 800.2, footerTop: 720 })).toBe(81);
    expect(chatFooterClearance({ footerBottom: 0, footerTop: 0 })).toBe(0);
});
