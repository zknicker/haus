import * as z from 'zod';
import type { SearchSource } from '../../hosted-search-notes.ts';

const linkSchema = z.looseObject({ title: z.string().nullish(), url: z.string().nullish() });

const annotationSchema = z.looseObject({
    title: z.string().nullish(),
    type: z.literal('url_citation'),
    url: z.string().nullish(),
    url_citation: linkSchema.optional(),
    urlCitation: linkSchema.optional(),
});

export function urlCitation(annotation: unknown) {
    const parsed = annotationSchema.safeParse(annotation);
    if (!parsed.success) {
        return null;
    }
    const nested = parsed.data.url_citation ?? parsed.data.urlCitation;
    const url = parsed.data.url || nested?.url;
    if (!url) {
        return null;
    }
    const source: SearchSource = { title: parsed.data.title || nested?.title || null, url };
    return source;
}
