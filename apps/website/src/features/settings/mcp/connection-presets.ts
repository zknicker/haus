import type { McpPreset } from '@haus/api';

export interface ConnectionPreset {
    description: string;
    id: McpPreset;
    name: string;
}

export const connectionPresets: readonly ConnectionPreset[] = [
    {
        description: 'Explore crypto prices, DEX pools, and token charts. Free, no API key.',
        id: 'coingecko',
        name: 'CoinGecko',
    },
    {
        description: 'Look up Amazon products and preview ASINs in messages.',
        id: 'rankwrangler',
        name: 'RankWrangler',
    },
    {
        description: 'Read and schedule events on your Google calendars.',
        id: 'google-calendar',
        name: 'Google Calendar',
    },
    {
        description: 'Query the MerchBase product catalog, designs, and sales.',
        id: 'merchbase',
        name: 'MerchBase',
    },
    {
        description: 'Search your artwork library, manage assets, and export designs.',
        id: 'merchbase-atlas',
        name: 'MerchBase Atlas',
    },
    {
        description: 'Manage Etsy listings, look up orders, and create product mockups.',
        id: 'handmade',
        name: 'Handmade',
    },
    {
        description: 'Review and fulfill Printful orders through your MerchBase account.',
        id: 'merchbase-fulfillment',
        name: 'MerchBase Fulfillment',
    },
    {
        description: 'Search trademarks, look up registrations, and screen listing text.',
        id: 'tmterminal',
        name: 'Trademark Terminal',
    },
    {
        description: 'Work with repositories, issues, and pull requests.',
        id: 'github',
        name: 'GitHub',
    },
    {
        description: 'Find, create, and update issues, projects, and comments.',
        id: 'linear',
        name: 'Linear',
    },
    {
        description: 'Manage DNS, Workers, and other Cloudflare services.',
        id: 'cloudflare',
        name: 'Cloudflare',
    },
    {
        description: 'Claim requests, run design routines, and review designs in Factory.',
        id: 'factory',
        name: 'Factory',
    },
    {
        description: 'Create designs, generate images, and render product mockups.',
        id: 'kittl',
        name: 'Kittl',
    },
    {
        description: 'Search and read public posts on X.',
        id: 'x',
        name: 'X',
    },
    {
        description: 'Read your Skool communities, posts, and classroom courses.',
        id: 'skool',
        name: 'Skool',
    },
];

/** Presets the Server has no account for yet, in catalog order. */
export function recommendedPresets(
    connections: readonly { preset?: McpPreset | null }[]
): readonly ConnectionPreset[] {
    return connectionPresets.filter(
        (preset) => !connections.some((connection) => connection.preset === preset.id)
    );
}
