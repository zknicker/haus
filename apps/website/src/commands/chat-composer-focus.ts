import * as React from 'react';

const chatComposerFocusEventName = 'haus:chat-composer-focus-request';

export function requestChatComposerFocus() {
    window.dispatchEvent(new Event(chatComposerFocusEventName));
}

export function useChatComposerFocusRequest(focusTextEditor: () => void) {
    React.useEffect(() => {
        const listener = () => {
            requestAnimationFrame(focusTextEditor);
        };

        window.addEventListener(chatComposerFocusEventName, listener);
        return () => window.removeEventListener(chatComposerFocusEventName, listener);
    }, [focusTextEditor]);
}
