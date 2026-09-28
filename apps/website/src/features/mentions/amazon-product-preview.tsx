import type { AmazonProductSummary } from '@haus/api';
import type { AmazonProductLookup } from './use-amazon-product.ts';

/** One hover card shape across loading, ready, failed, and disconnected lookups. */
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
            <div
                aria-busy={lookup.status === 'loading' || undefined}
                className="hover-card__content haus-hover-card dark flex min-w-0 flex-col gap-0.5"
            >
                <strong className="line-clamp-2 font-semibold text-foreground text-sm leading-snug">
                    {product?.title ?? asin}
                </strong>
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

/** The transparent cutout when RankWrangler has one, else the listing photo. */
export function productImage(product: AmazonProductSummary): string | undefined {
    if (product.cutoutThumbnail?.status === 'available') {
        return product.cutoutThumbnail.url;
    }
    return product.thumbnail.status === 'available' ? product.thumbnail.url : undefined;
}

function previewNotice(lookup: AmazonProductLookup): string | undefined {
    switch (lookup.status) {
        case 'loading':
            return 'Fetching product details…';
        case 'failed':
            return 'Product details unavailable';
        case 'disconnected':
            return 'Connect RankWrangler for product details';
        case 'ready':
            return lookup.detailFailed ? 'Price unavailable' : undefined;
        default:
            return undefined;
    }
}
