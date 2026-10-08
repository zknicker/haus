import { type AmazonProductIdentity, amazonProductUrl, parseAmazonProduct } from '@haus/api';
import * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import type { AmazonProductLookup } from './amazon-product-lookup.ts';
import { AmazonProductPreview, lookupInProgress, productImage } from './amazon-product-preview.tsx';
import { ReferenceChip } from './reference-chip.tsx';
import { useAmazonProduct } from './use-amazon-product.ts';

/** The chip comes from the pattern match; the RankWrangler lookup only fills it in. */
export function AmazonReference({
    product,
    serverId,
    href,
}: {
    product: AmazonProductIdentity;
    serverId: string;
    href?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const lookup = useAmazonProduct(serverId, product, open);
    return (
        <AmazonReferenceChip
            href={href}
            lookup={lookup}
            onPreviewOpenChange={setOpen}
            product={product}
        />
    );
}

export function AmazonReferenceChip({
    product,
    lookup,
    href,
    onPreviewOpenChange,
}: {
    product: AmazonProductIdentity;
    lookup: AmazonProductLookup;
    href?: string;
    onPreviewOpenChange?: (open: boolean) => void;
}) {
    const summary = lookup.status === 'ready' ? lookup.product : undefined;
    const label = summary?.shortName ?? product.asin;
    return (
        <CursorHoverCard
            className="haus-product-hover w-96 max-w-[calc(100vw-2rem)]"
            content={<AmazonProductPreview asin={product.asin} lookup={lookup} />}
            onOpenChange={onPreviewOpenChange}
        >
            <a
                aria-busy={lookupInProgress(lookup) || undefined}
                aria-label={`Open ${label} on Amazon`}
                className="reference-chip-trigger inline-flex max-w-full align-middle no-underline"
                href={href ?? amazonProductUrl(product)}
                rel="noreferrer"
                target="_blank"
            >
                <ReferenceChip
                    className="max-w-64"
                    id={amazonProductUrl(product)}
                    kind="product"
                    label={label}
                    metadata={{
                        iconDataUrl: summary ? productImage(summary) : undefined,
                        pending: lookupInProgress(lookup),
                    }}
                />
            </a>
        </CursorHoverCard>
    );
}

/** Only direct prose text is scanned; Markdown owns nested links, images, and code. */
export function renderAmazonText(children: React.ReactNode, serverId?: string): React.ReactNode {
    if (!serverId) {
        return children;
    }
    return React.Children.map(children, (child) => {
        if (typeof child !== 'string') {
            return child;
        }
        const parts: React.ReactNode[] = [];
        let cursor = 0;
        for (const match of child.matchAll(/(?<![A-Za-z0-9_/-])B[A-Z0-9]{9}(?![A-Za-z0-9_/-])/gu)) {
            const product = parseAmazonProduct(match[0]);
            if (!product) {
                continue;
            }
            parts.push(child.slice(cursor, match.index));
            parts.push(<AmazonReference key={match.index} product={product} serverId={serverId} />);
            cursor = match.index + match[0].length;
        }
        parts.push(child.slice(cursor));
        return parts;
    });
}
