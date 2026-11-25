import * as React from 'react';
import { ChatMarkdownText } from '../../chats/chat-markdown-text.tsx';
import { losslessMarkdownDocument, markdownFileText } from './markdown-round-trip.ts';
import { useMarkdownEditor } from './use-markdown-editor.ts';

export function MarkdownDocument({
    autoFocus = false,
    label,
    onChange,
    original,
    readOnly,
    text,
}: {
    autoFocus?: boolean;
    label: string;
    onChange: (text: string) => void;
    original: string;
    readOnly: boolean;
    text: string;
}) {
    const [initial] = React.useState(() => losslessMarkdownDocument(text));
    if (!initial) {
        return (
            <div className="text-base">
                <ChatMarkdownText content={text} />
            </div>
        );
    }
    return (
        <EditableMarkdown
            autoFocus={autoFocus}
            initial={initial}
            label={label}
            onChange={(doc) => onChange(markdownFileText(doc, original))}
            readOnly={readOnly}
        />
    );
}

function EditableMarkdown({
    autoFocus,
    initial,
    label,
    onChange,
    readOnly,
}: {
    autoFocus: boolean;
    initial: NonNullable<ReturnType<typeof losslessMarkdownDocument>>;
    label: string;
    onChange: Parameters<typeof useMarkdownEditor>[0]['onChange'];
    readOnly: boolean;
}) {
    const mountRef = useMarkdownEditor({
        ariaLabel: label,
        autoFocus,
        editable: !readOnly,
        initial,
        onChange,
    });
    return <div ref={mountRef} />;
}
