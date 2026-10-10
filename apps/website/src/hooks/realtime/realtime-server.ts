/**
 * The Server a Server-level stream listens to, named by both ids its caches
 * are keyed on: `server.bySlug` holds only the slug, so a stream refreshes
 * exactly its own Server's detail rather than every cached slug.
 */
export interface RealtimeServer {
    id: string;
    slug: string;
}
