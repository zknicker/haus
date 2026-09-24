import {
    type AmazonProductDetail,
    type AmazonProductIdentity,
    type AmazonProductSummary,
    amazonProductUrl,
    parseAmazonProduct,
} from '@haus/api';
import * as React from 'react';
import { CursorHoverCard } from '../../components/ui/cursor-hover-card.tsx';
import { ReferenceChip } from './reference-chip.tsx';
import { useAmazonProduct } from './use-amazon-product.ts';

export function AmazonReference({
    product,
    serverId,
    children,
    href,
}: {
    product: AmazonProductIdentity;
    serverId: string;
    children: React.ReactNode;
    href?: string;
}) {
    const [open, setOpen] = React.useState(false);
    const result = useAmazonProduct(serverId, product, open);
    if (!result.product) {
        return children;
    }
    const label = result.product.shortName ?? product.asin;
    return (
        <CursorHoverCard
            className="haus-product-hover w-96 max-w-[calc(100vw-2rem)]"
            content={
                <AmazonProductPreview
                    detailFailed={result.detailFailed}
                    product={
                        result.detail
                            ? { ...result.detail, cutoutThumbnail: result.product.cutoutThumbnail }
                            : result.product
                    }
                />
            }
            onOpenChange={setOpen}
        >
            <a
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
                        iconDataUrl:
                            result.product.cutoutThumbnail?.status === 'available'
                                ? result.product.cutoutThumbnail.url
                                : undefined,
                    }}
                />
            </a>
        </CursorHoverCard>
    );
}

export function AmazonProductPreview({
    product,
    detailFailed = false,
}: {
    product: AmazonProductSummary | AmazonProductDetail;
    detailFailed?: boolean;
}) {
    const image =
        product.cutoutThumbnail?.status === 'available'
            ? product.cutoutThumbnail
            : product.thumbnail;
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2">
            <div className="hover-card__content haus-hover-card dark flex min-w-0 flex-col gap-0.5">
                <strong className="line-clamp-2 font-semibold text-foreground text-sm leading-snug">
                    {product.title ?? product.asin}
                </strong>
                {product.brand ? (
                    <span className="truncate text-muted text-xs">{product.brand}</span>
                ) : null}
                {'price' in product && product.price ? (
                    <strong className="font-semibold text-base text-foreground leading-snug">
                        {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: product.price.currencyCode,
                        }).format(product.price.amountMinor / 100)}
                    </strong>
                ) : null}
                {product.amazonListingStatus === 'deleted' ? (
                    <span className="text-warning text-xs">Listing removed</span>
                ) : null}
                {detailFailed ? (
                    <span className="text-muted text-xs">Price unavailable</span>
                ) : null}
            </div>
            {image.status === 'available' ? (
                <div className="haus-product-hover__image">
                    <img
                        alt={product.title ?? product.asin}
                        className="size-18 object-contain"
                        height={72}
                        src={image.url}
                        width={72}
                    />
                    <span aria-hidden="true" className="haus-product-hover__sparkle">
                        ✦
                    </span>
                </div>
            ) : null}
        </div>
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
            parts.push(
                <AmazonReference key={match.index} product={product} serverId={serverId}>
                    {match[0]}
                </AmazonReference>
            );
            cursor = match.index + match[0].length;
        }
        parts.push(child.slice(cursor));
        return parts;
    });
}
