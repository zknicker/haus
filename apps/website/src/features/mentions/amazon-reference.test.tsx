import { expect, test } from 'bun:test';
import type { AmazonProductSummary } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AmazonProductLookup } from './amazon-product-lookup.ts';
import { AmazonProductPreview } from './amazon-product-preview.tsx';
import { AmazonReferenceChip, renderAmazonText } from './amazon-reference.tsx';
import { ReferenceChip } from './reference-chip.tsx';

const identity = { asin: 'B07XN9T11R', marketplaceId: 'ATVPDKIKX0DER' } as const;
const summary = {
    ...identity,
    shortName: 'Freaky Lunch Lady',
    cutoutThumbnail: { status: 'available', url: 'https://images.example.com/cutout.webp' },
    title: 'Freaky Lunch Lady Shirt',
    brand: 'Lunch Lady Designs',
    thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
    amazonListingStatus: 'active',
} satisfies AmazonProductSummary;
const chip = (lookup: AmazonProductLookup) =>
    renderToStaticMarkup(<AmazonReferenceChip lookup={lookup} product={identity} />);
const preview = (lookup: AmazonProductLookup) =>
    renderToStaticMarkup(<AmazonProductPreview asin={identity.asin} lookup={lookup} />);

test('product previews show title, brand, price, and listing removal', () => {
    const markup = preview({
        status: 'ready',
        detailFailed: false,
        product: {
            ...summary,
            amazonListingStatus: 'deleted',
            price: { amountMinor: 1999, currencyCode: 'USD' },
        },
    });
    for (const text of [
        'Freaky Lunch Lady Shirt',
        '$19.99',
        'Lunch Lady Designs',
        'Listing removed',
    ]) {
        expect(markup).toContain(text);
    }
});
test('the chip renders from the pattern match before any product data', () => {
    const markup = chip({ status: 'loading' });
    expect(markup).toContain('aria-label="Open B07XN9T11R on Amazon"');
    expect(markup).toContain('href="https://www.amazon.com/dp/B07XN9T11R"');
    expect(markup).not.toContain('Copy ASIN');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('reference-chip--product');
    expect(markup).toContain('animate-pulse');
    expect(markup).not.toContain('<img');
    expect(preview({ status: 'loading' })).toContain('Fetching product details…');
});
test('loaded product data fills the label and cutout in place', () => {
    const markup = chip({ status: 'ready', detailFailed: false, product: summary });
    expect(markup).toContain('aria-label="Open Freaky Lunch Lady on Amazon"');
    expect(markup).toContain('https://images.example.com/cutout.webp');
    expect(markup).not.toContain('aria-busy');
    const unenriched = chip({
        status: 'ready',
        detailFailed: false,
        product: { ...summary, shortName: null, cutoutThumbnail: null },
    });
    expect(unenriched).toContain('aria-label="Open B07XN9T11R on Amazon"');
    expect(unenriched).toContain('https://images.example.com/product.jpg');
    expect(preview({ status: 'ready', detailFailed: true, product: summary })).toContain(
        'Price unavailable'
    );
});
test('failed lookups keep the ASIN chip linking to Amazon', () => {
    for (const lookup of [
        { status: 'unavailable' },
        { status: 'temporarilyUnavailable' },
    ] as const) {
        const markup = chip(lookup);
        expect(markup).toContain('aria-label="Open B07XN9T11R on Amazon"');
        expect(markup).toContain('href="https://www.amazon.com/dp/B07XN9T11R"');
        expect(markup).not.toContain('animate-pulse');
    }
});
test('every lookup state leads with a copyable ASIN, and the title follows only when RankWrangler returned one', () => {
    const lookups = [
        { status: 'loading' },
        { status: 'retrying' },
        { status: 'temporarilyUnavailable' },
        { status: 'unavailable' },
        { status: 'ready', detailFailed: false, product: summary },
        {
            status: 'ready',
            detailFailed: false,
            product: { ...summary, title: null },
        },
    ] as const satisfies readonly AmazonProductLookup[];
    for (const lookup of lookups) {
        const markup = preview(lookup);
        expect(markup).toMatch(/<code[^>]*class="[^"]*\bfont-mono\b[^"]*"[^>]*>B07XN9T11R<\/code>/);
        expect(markup).toContain('aria-label="Copy ASIN"');
    }
    const titled = preview({ status: 'ready', detailFailed: false, product: summary });
    expect(titled.match(/B07XN9T11R/g)).toEqual(['B07XN9T11R']);
    expect(titled).toContain('Freaky Lunch Lady Shirt');
    expect(titled.indexOf('B07XN9T11R')).toBeLessThan(titled.indexOf('Freaky Lunch Lady Shirt'));
    const untitled = preview({
        status: 'ready',
        detailFailed: false,
        product: { ...summary, title: null },
    });
    expect(untitled).not.toContain('Freaky Lunch Lady Shirt');
    expect(untitled).not.toMatch(/<strong[^>]*>B07XN9T11R<\/strong>/);
});
test('each lookup state explains itself in the hover card', () => {
    const copy: Record<Exclude<AmazonProductLookup['status'], 'ready'>, string> = {
        loading: 'Fetching product details…',
        retrying: 'Product details are taking longer than usual. Retrying…',
        temporarilyUnavailable:
            'Product details are temporarily unavailable. We’ll try again shortly.',
        unavailable: 'Product details unavailable',
    };
    for (const [status, text] of Object.entries(copy)) {
        expect(preview({ status } as AmazonProductLookup)).toContain(text);
    }
    expect(chip({ status: 'retrying' })).toContain('animate-pulse');
});
test('product chips share the reference shell and thumbnail registry', () => {
    const markup = renderToStaticMarkup(
        <ReferenceChip
            id="https://amazon.com/dp/B07XN9T11R"
            kind="product"
            label="Freaky Lunch Lady"
            metadata={{ iconDataUrl: 'https://images.example.com/product.jpg' }}
        />
    );
    expect(markup).toContain('reference-chip--product');
    expect(markup).toContain('https://images.example.com/product.jpg');
    expect(markup).toContain('chip--tertiary');
});
test('bare ASIN scanning leaves nested code and links untouched', () => {
    const content = [
        <code key="code">B07XN9T11R</code>,
        <a href="https://example.com" key="link">
            B07XN9T11R
        </a>,
        ' BOOKSELLER XB07XN9T11R /B07XN9T11R ',
    ];
    expect(renderToStaticMarkup(renderAmazonText(content, 'server'))).toBe(
        renderToStaticMarkup(content)
    );
    expect(renderAmazonText('B07XN9T11R')).toBe('B07XN9T11R');
});
