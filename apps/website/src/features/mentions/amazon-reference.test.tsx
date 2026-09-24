import { expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';
import { AmazonProductPreview, renderAmazonText } from './amazon-reference.tsx';
import { ReferenceChip } from './reference-chip.tsx';

test('product previews show title, brand, price, and listing removal', () => {
    const markup = renderToStaticMarkup(
        <AmazonProductPreview
            product={{
                asin: 'B07XN9T11R',
                marketplaceId: 'ATVPDKIKX0DER',
                shortName: 'Freaky Lunch Lady',
                cutoutThumbnail: {
                    status: 'available',
                    url: 'https://images.example.com/cutout.webp',
                },
                title: 'Freaky Lunch Lady',
                brand: 'Lunch Lady Designs',
                thumbnail: { status: 'available', url: 'https://images.example.com/product.jpg' },
                amazonListingStatus: 'deleted',
                price: { amountMinor: 1999, currencyCode: 'USD' },
            }}
        />
    );
    for (const text of ['Freaky Lunch Lady', '$19.99', 'Lunch Lady Designs', 'Listing removed']) {
        expect(markup).toContain(text);
    }
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
