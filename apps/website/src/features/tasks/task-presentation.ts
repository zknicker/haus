import type { TaskMessagePlace } from '@haus/api';

export function taskMessagePlaceLabel({ chatKind, chatName }: TaskMessagePlace) {
    return chatKind === 'channel' ? `#${chatName}` : 'DM';
}
