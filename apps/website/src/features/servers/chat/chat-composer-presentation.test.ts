import { expect, test } from 'bun:test';
import {
    hasChatComposerPayload,
    resolveChatComposerPlaceholder,
} from './chat-composer-presentation.ts';

test('names the current channel or Agent in the default composer placeholder', () => {
    expect(resolveChatComposerPlaceholder('product')).toBe('Message product');
    expect(resolveChatComposerPlaceholder('Blippy')).toBe('Message Blippy');
});

test('preserves purpose-specific composer copy', () => {
    expect(resolveChatComposerPlaceholder('product', 'Add a reply…')).toBe('Add a reply…');
});

test('recognizes submittable composer payload', () => {
    expect(hasChatComposerPayload({ attachmentCount: 0, content: 'Hi' })).toBe(true);
    expect(
        hasChatComposerPayload({
            attachmentCount: 0,
            content: 'Testing sdfksdfkjhsdkifhsdf sdf sdfkjsdf kjsdhf kjhsdf kjhsdf kihsd. sdf',
        })
    ).toBe(true);
    expect(hasChatComposerPayload({ attachmentCount: 1, content: '' })).toBe(true);
    expect(hasChatComposerPayload({ attachmentCount: 0, content: '   ' })).toBe(false);
});
