const trackingParams = new Set([
    '_clear',
    'api-mode',
    'openLinerExtension',
    'ref',
    'referral_type',
]);
const youtubeHost = /(^|\.)(youtube\.com|youtu\.be)$/iu;

export function normalizeSearchUrl(url: string) {
    if (!URL.canParse(url)) {
        return url;
    }
    const parsed = new URL(url);
    parsed.hash = '';
    if (!youtubeHost.test(parsed.hostname)) {
        for (const name of [...parsed.searchParams.keys()]) {
            if (trackingParams.has(name) || name.toLowerCase().startsWith('utm_')) {
                parsed.searchParams.delete(name);
            }
        }
    }
    const query = parsed.searchParams.toString();
    parsed.search = query ? `?${query}` : '';
    return parsed.toString();
}
