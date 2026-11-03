import type { AmazonProductSummary } from '@haus/api';
import type { AmazonProductLookup } from './amazon-product-lookup.ts';

export function AmazonProductPreview({
    asin,
    lookup,
}: {
    asin: string;
    lookup: AmazonProductLookup;
}) {
    const product = lookup.status === 'ready' ? lookup.product : undefined;
    const image = product ? productImage(product) : undefined;
    const notice = previewNotice(lookup);
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-2">
            <div className="hover-card__content haus-hover-card dark flex min-w-0 flex-col gap-0.5">
                <code className="truncate font-mono text-muted text-xs">{asin}</code>
                <div
                    aria-busy={lookupInProgress(lookup) || undefined}
                    className="flex min-w-0 flex-col gap-0.5"
                >
                    {product?.title ? (
                        <strong className="line-clamp-2 font-semibold text-foreground text-sm leading-snug">
                            {product.title}
                        </strong>
                    ) : null}
                    {product?.brand ? (
                        <span className="truncate text-muted text-xs">{product.brand}</span>
                    ) : null}
                    {product?.price ? (
                        <strong className="font-semibold text-base text-foreground leading-snug">
                            {new Intl.NumberFormat('en-US', {
                                style: 'currency',
                                currency: product.price.currencyCode,
                            }).format(product.price.amountMinor / 100)}
                        </strong>
                    ) : null}
                    {product?.amazonListingStatus === 'deleted' ? (
                        <span className="text-warning text-xs">Listing removed</span>
                    ) : null}
                    {notice ? <span className="text-muted text-xs">{notice}</span> : null}
                </div>
            </div>
            {image ? (
                <div className="haus-product-hover__image">
                    <img
                        alt={product?.title ?? asin}
                        className="size-18 object-contain"
                        height={72}
                        src={image}
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

export function productImage(product: AmazonProductSummary): string | undefined {
    if (product.cutoutThumbnail?.status === 'available') {
        return product.cutoutThumbnail.url;
    }
    return product.thumbnail.status === 'available' ? product.thumbnail.url : undefined;
}

export function lookupInProgress(lookup: AmazonProductLookup): boolean {
    return lookup.status === 'loading' || lookup.status === 'retrying';
}

export function previewNotice(lookup: AmazonProductLookup): string | undefined {
    switch (lookup.status) {
        case 'loading':
            return 'Fetching product details…';
        case 'retrying':
            return 'Product details are taking longer than usual. Retrying…';
        case 'temporarilyUnavailable':
            return 'Product details are temporarily unavailable. We’ll try again shortly.';
        case 'unavailable':
            return 'Product details unavailable';
        case 'ready':
            return lookup.detailFailed ? 'Price unavailable' : undefined;
        default:
            return undefined;
    }
}
