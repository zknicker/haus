import * as React from 'react';
import { useMessageScroller } from '../../../components/chats/message-scroller.tsx';

/** A local send resumes following only after its optimistic row has committed. */
export function ChatSendScroll({ messages = [] }: { messages?: readonly { nonce: string }[] }) {
    const scroller = useMessageScroller();
    const previous = React.useRef(new Set(messages.map((message) => message.nonce)));

    React.useLayoutEffect(() => {
        const hasNewSend = messages.some((message) => !previous.current.has(message.nonce));
        previous.current = new Set(messages.map((message) => message.nonce));
        if (hasNewSend) {
            scroller.scrollToEnd({ behavior: 'instant' });
        }
    }, [messages, scroller]);

    return null;
}
