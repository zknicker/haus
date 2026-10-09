import type { Markdown } from '@heroui-pro/react/markdown';
import * as React from 'react';
import { renderAmazonText } from './amazon-reference.tsx';
import { renderTimeText, TimeChipQuoteContext } from './time-chip.tsx';

/**
 * Prose elements whose direct text becomes product and time chips. Markdown
 * owns code, so code spans and blocks never reach these renderers.
 */
export function proseChipComponents({
    sentAt,
    serverId,
}: {
    sentAt?: string;
    serverId?: string;
}): React.ComponentProps<typeof Markdown>['components'] {
    const sent = sentAt ? new Date(sentAt) : undefined;
    const chips = (children: React.ReactNode) => {
        const products = renderAmazonText(children, serverId);
        if (!sent || Number.isNaN(sent.getTime())) {
            return products;
        }
        return React.Children.map(products, (child) =>
            typeof child === 'string' ? renderTimeText(child, sent, serverId) : child
        );
    };
    return {
        p: ({ children }) => <p>{chips(children)}</p>,
        li: ({ children }) => <li>{chips(children)}</li>,
        td: ({ children, style, align }) => (
            <td align={align} style={style}>
                {chips(children)}
            </td>
        ),
        th: ({ children, style, align }) => (
            <th align={align} style={style}>
                {chips(children)}
            </th>
        ),
        strong: ({ children }) => <strong>{chips(children)}</strong>,
        em: ({ children }) => <em>{chips(children)}</em>,
        del: ({ children }) => <del>{chips(children)}</del>,
        h1: ({ children }) => <h1>{chips(children)}</h1>,
        h2: ({ children }) => <h2>{chips(children)}</h2>,
        h3: ({ children }) => <h3>{chips(children)}</h3>,
        h4: ({ children }) => <h4>{chips(children)}</h4>,
        h5: ({ children }) => <h5>{chips(children)}</h5>,
        h6: ({ children }) => <h6>{chips(children)}</h6>,
        blockquote: ({ children }) => (
            <TimeChipQuoteContext value>
                <blockquote>{children}</blockquote>
            </TimeChipQuoteContext>
        ),
    };
}
