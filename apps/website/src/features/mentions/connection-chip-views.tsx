import {
    type AmazonProductSummary,
    type ConnectionChipKind,
    connectionChipKindSchema,
    type LinearIssueUrl,
    parseAmazonProduct,
    parseLinearIssueUrl,
} from '@haus/api';
import type * as React from 'react';
import { AmazonReference, AmazonReferenceChip } from './amazon-reference.tsx';
import { LinearIssueChip, LinearIssueReference } from './linear-issue-reference.tsx';

interface ChipLinkInput {
    /** What the link renders as when it is not this chip's, or the Server lacks the connection. */
    fallback: React.ReactNode;
    href: string;
    serverId: string;
}

/**
 * How the App draws one connection chip: the link it turns into a chip, and
 * a static sample for the connection's settings page that reads nothing.
 */
interface ConnectionChipView {
    link: (input: ChipLinkInput) => React.ReactNode | null;
    Sample: () => React.ReactNode;
}

export const connectionChipViews: Record<ConnectionChipKind, ConnectionChipView> = {
    'amazon-product': {
        link: ({ fallback, href, serverId }) => {
            const product = parseAmazonProduct(href);
            return product ? (
                <AmazonReference
                    fallback={fallback}
                    href={href}
                    product={product}
                    serverId={serverId}
                />
            ) : null;
        },
        Sample: () => (
            <AmazonReferenceChip
                lookup={{ detailFailed: false, product: sampleProduct, status: 'ready' }}
                product={sampleProduct}
            />
        ),
    },
    'linear-issue': {
        link: ({ fallback, href, serverId }) => {
            const issue = parseLinearIssueUrl(href);
            return issue ? (
                <LinearIssueReference
                    fallback={fallback}
                    href={href}
                    issue={issue}
                    serverId={serverId}
                />
            ) : null;
        },
        Sample: () => (
            <LinearIssueChip
                agents={[]}
                href={sampleIssue.url}
                issue={sampleIssue}
                notice={null}
                state={{
                    kind: 'issue',
                    label: `${sampleIssue.identifier} Polish the onboarding tour`,
                    pending: false,
                    view: null,
                }}
            />
        ),
    },
};

/** The chip a website link becomes, or the link itself when no connection chip claims it. */
export function connectionChipLink(input: ChipLinkInput): React.ReactNode {
    for (const kind of connectionChipKindSchema.options) {
        const chip = connectionChipViews[kind].link(input);
        if (chip) {
            return chip;
        }
    }
    return input.fallback;
}

const sampleTeeImage = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#f97316" d="M8 3 4 5 2 9l3 1.5L6 9v12h12V9l1 1.5L22 9l-2-4-4-2c-.5 1.5-2 2.5-4 2.5S8.5 4.5 8 3Z"/></svg>'
)}`;

const sampleProduct = {
    amazonListingStatus: 'active',
    asin: 'B07XN9T11R',
    brand: null,
    cutoutThumbnail: { status: 'available', url: sampleTeeImage },
    marketplaceId: 'ATVPDKIKX0DER',
    shortName: 'Pumpkin Patch Tee',
    thumbnail: { status: 'unavailable' },
    title: 'Pumpkin Patch Tee',
} satisfies AmazonProductSummary;

const sampleIssue: LinearIssueUrl = {
    identifier: 'HAUS-42',
    url: 'https://linear.app/haus/issue/HAUS-42',
    urlKey: 'haus',
};
