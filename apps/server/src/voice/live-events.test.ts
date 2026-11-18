import { expect, test } from 'bun:test';
import { VoiceDelegations } from './live-events.ts';
import { readVoiceAudioCommand } from './voice-audio-command.ts';
import { liveHistory, voiceTextChunks } from './voice-text.ts';

test('waits for transcription after delegation and for a complete quiet interval', () => {
    const requests = new VoiceDelegations();
    requests.request('first');
    expect(requests.take(1000)).toBeNull();
    requests.append('Please deploy', 1000);
    expect(requests.take(1700)).toBeNull();
    requests.append(' to staging.', 1750);
    expect(requests.take(2500)).toBeNull();
    expect(requests.take(2600)).toEqual({ id: 'first', text: 'Please deploy to staging.' });
    expect(requests.take(3000)).toBeNull();
});

test('deduplicates requests and preserves subsequent corrections', () => {
    const requests = new VoiceDelegations();
    requests.request('first');
    requests.append('Deploy Thursday.', 0);
    expect(requests.take(1000)?.text).toBe('Deploy Thursday.');
    requests.request('first');
    requests.append('Actually, Friday.', 1100);
    expect(requests.take(2100)).toBeNull();
    requests.request('correction');
    expect(requests.take(2200)).toEqual({ id: 'correction', text: 'Actually, Friday.' });
});

test('keeps multi-byte text intact within the Live context budget', () => {
    const text = '你好🙂'.repeat(1000);
    const chunks = voiceTextChunks(text);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((chunk) => Buffer.byteLength(chunk) <= 450)).toBe(true);
    const history = liveHistory(
        Array.from({ length: 20 }, (_, index) => ({
            agentId: index % 2 ? 'agent' : null,
            content: text,
        }))
    );
    expect(
        history.reduce((bytes, item) => bytes + Buffer.byteLength(item.content[0]!.text), 0)
    ).toBeLessThanOrEqual(6000);
});

test('rejects malformed PCM samples and arbitrary OpenAI control events', () => {
    expect(() => readVoiceAudioCommand('{"type":"audio","audio":"AQ=="}', false)).toThrow(
        'Incomplete PCM'
    );
    expect(() => readVoiceAudioCommand('{"type":"session.start","session":{}}', false)).toThrow();
    expect(() => readVoiceAudioCommand('{"type":"close"}', true)).toThrow();
    expect(readVoiceAudioCommand('{"type":"audio","audio":"AAA="}', false)).toEqual({
        type: 'session.input_audio.append',
        audio: 'AAA=',
    });
});
