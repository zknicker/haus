import { expect, test } from 'bun:test';
import { parseAmazonProduct } from './amazon-products.ts';

test('recognizes US Amazon product identity independently of tracking parameters', () => {
    for (const input of [
        'B07XN9T11R',
        'https://www.amazon.com/dp/B07XN9T11R?tag=example',
        'https://amazon.com/title/gp/product/B07XN9T11R/ref=abc',
        'https://m.amazon.com/gp/aw/d/B07XN9T11R',
    ]) {
        expect(parseAmazonProduct(input)).toEqual({
            asin: 'B07XN9T11R',
            marketplaceId: 'ATVPDKIKX0DER',
        });
    }
});
test('rejects lookalike hosts, unknown markets, partial ASINs, and unrelated paths', () => {
    for (const input of [
        'B07XN9T11RX',
        'b07xn9t11r',
        'BOOKSELLER',
        'https://amazon.com.evil.test/dp/B07XN9T11R',
        'https://amazon.de/dp/B07XN9T11R',
        'https://amazon.com/search/B07XN9T11R',
        'https://user@amazon.com/dp/B07XN9T11R',
        'https://amazon.com/dp/B07XN9T11RX',
    ]) {
        expect(parseAmazonProduct(input)).toBeNull();
    }
});
