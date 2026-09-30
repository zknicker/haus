import { Description, Label, ListBox } from '@heroui/react';
import { Globe02Icon, Search01Icon } from '@hugeicons-pro/core-stroke-rounded';
import * as React from 'react';
import { Icon } from '../../components/ui/icon.tsx';
import type { BrowserAddressSuggestion, BrowserMatchRange } from './browser-address-suggestions.ts';

const markSize = 16;

/**
 * One row under the address field: a 16px mark, the title, then the condensed URL, muted, on the
 * same line. The typed-text row carries a globe or a search glyph instead of a favicon. Row
 * layout lives on `.browser-address-popover` in `styles/default-theme.css`.
 */
export function BrowserAddressSuggestionRow({
    suggestion,
}: {
    suggestion: BrowserAddressSuggestion;
}) {
    if (suggestion.kind !== 'history') {
        return (
            <ListBox.Item id={suggestion.id} textValue={suggestion.label}>
                <Icon
                    aria-hidden="true"
                    icon={suggestion.kind === 'go' ? Globe02Icon : Search01Icon}
                    size={markSize}
                />
                <Label>{suggestion.label}</Label>
            </ListBox.Item>
        );
    }
    return (
        <ListBox.Item id={suggestion.id} textValue={suggestion.title}>
            <Favicon url={suggestion.entry.faviconUrl} />
            <Label>
                <Highlight range={suggestion.titleMatch} text={suggestion.title} />
            </Label>
            {suggestion.title === suggestion.displayUrl ? null : (
                <Description>
                    <Highlight range={suggestion.displayUrlMatch} text={suggestion.displayUrl} />
                </Description>
            )}
        </ListBox.Item>
    );
}

function Highlight({ text, range }: { text: string; range: BrowserMatchRange | null }) {
    if (!range) {
        return text;
    }
    const [start, end] = range;
    return (
        <>
            {text.slice(0, start)}
            <strong>{text.slice(start, end)}</strong>
            {text.slice(end)}
        </>
    );
}

/** The page's favicon, or a globe when it has none or it fails to load. */
function Favicon({ url }: { url: string | null }) {
    const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
    if (!url || url === failedUrl) {
        return <Icon aria-hidden="true" icon={Globe02Icon} size={markSize} />;
    }
    return (
        // biome-ignore lint/a11y/noNoninteractiveElementInteractions: Image load failure is not a user interaction.
        <img
            alt=""
            draggable={false}
            height={markSize}
            onError={() => setFailedUrl(url)}
            referrerPolicy="no-referrer"
            src={url}
            width={markSize}
        />
    );
}
