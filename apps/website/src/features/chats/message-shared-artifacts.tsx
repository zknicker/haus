/**
 * Cheap gate for a message that may link this Server's library, so the rest
 * of the transcript pays nothing: no provider or tile.
 */
export function mayLinkSharedArtifact(content: string) {
    return content.includes('/artifacts/art_');
}
