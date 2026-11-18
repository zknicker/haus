import * as React from 'react';
import { chatTypingThoughtRecallLingerMs } from './chat-typing-thought.ts';

/**
 * Whether the pointer is recalling the latest thought over the typing strip's
 * avatars and dots. Mouse and pen only: hover has no touch or keyboard
 * equivalent, and the strip earns no tab stop. Leaving lingers briefly so the
 * bubble does not blink while the pointer crosses a gap.
 */
export function useChatTypingThoughtRecall(enabled: boolean) {
    const [hovered, setHovered] = React.useState(false);
    const linger = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    // The region unmounts with the strip's content, which fires no pointer leave.
    if (!enabled && hovered) {
        setHovered(false);
    }

    const onPointerEnter = React.useCallback((event: React.PointerEvent) => {
        if (event.pointerType === 'touch') {
            return;
        }
        clearTimeout(linger.current);
        setHovered(true);
    }, []);
    const onPointerLeave = React.useCallback(() => {
        clearTimeout(linger.current);
        linger.current = setTimeout(() => setHovered(false), chatTypingThoughtRecallLingerMs);
    }, []);
    React.useEffect(() => () => clearTimeout(linger.current), []);

    return { onPointerEnter, onPointerLeave, recalled: enabled && hovered };
}
