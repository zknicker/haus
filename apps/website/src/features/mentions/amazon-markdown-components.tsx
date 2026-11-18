import type { Markdown } from '@heroui-pro/react/markdown';
import type * as React from 'react';
import { renderAmazonText } from './amazon-reference.tsx';

export function amazonMarkdownComponents(
    serverId?: string
): React.ComponentProps<typeof Markdown>['components'] {
    return {
        p: ({ children }) => <p>{renderAmazonText(children, serverId)}</p>,
        li: ({ children }) => <li>{renderAmazonText(children, serverId)}</li>,
        td: ({ children, style, align }) => (
            <td align={align} style={style}>
                {renderAmazonText(children, serverId)}
            </td>
        ),
        th: ({ children, style, align }) => (
            <th align={align} style={style}>
                {renderAmazonText(children, serverId)}
            </th>
        ),
        strong: ({ children }) => <strong>{renderAmazonText(children, serverId)}</strong>,
        em: ({ children }) => <em>{renderAmazonText(children, serverId)}</em>,
        del: ({ children }) => <del>{renderAmazonText(children, serverId)}</del>,
        h1: ({ children }) => <h1>{renderAmazonText(children, serverId)}</h1>,
        h2: ({ children }) => <h2>{renderAmazonText(children, serverId)}</h2>,
        h3: ({ children }) => <h3>{renderAmazonText(children, serverId)}</h3>,
        h4: ({ children }) => <h4>{renderAmazonText(children, serverId)}</h4>,
        h5: ({ children }) => <h5>{renderAmazonText(children, serverId)}</h5>,
        h6: ({ children }) => <h6>{renderAmazonText(children, serverId)}</h6>,
    };
}
