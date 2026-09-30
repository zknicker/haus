import { voiceClientEventSchema } from '@haus/api';

export function readVoiceAudioCommand(raw: string, binary: boolean) {
    if (binary) {
        throw new Error('Expected JSON');
    }
    const event = voiceClientEventSchema.parse(JSON.parse(raw));
    switch (event.type) {
        case 'close':
            return { type: 'session.close' };
        case 'mute':
            return {
                type: event.muted ? 'session.input_audio.mute' : 'session.input_audio.unmute',
            };
        case 'audio': {
            const bytes = Buffer.from(event.audio, 'base64');
            if (!bytes.length || bytes.length % 2) {
                throw new Error('Incomplete PCM sample');
            }
            return { type: 'session.input_audio.append', audio: event.audio };
        }
        default: {
            const exhaustive: never = event;
            return exhaustive;
        }
    }
}
