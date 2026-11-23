import type { ChannelAppearance } from '../../chats/channel-appearance-fields.tsx';

export function appearanceChange(shown: ChannelAppearance, next: ChannelAppearance) {
    return {
        ...(next.color === shown.color ? {} : { color: next.color }),
        ...(next.icon === shown.icon ? {} : { icon: next.icon }),
    };
}
