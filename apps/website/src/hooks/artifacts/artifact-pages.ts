/**
 * Artifact lists page by offset, 50 entries per page (docs/api/artifacts.md).
 * The result carries no cursor, so a full page means "ask for more"; a short
 * page ends the list. Every artifact list reads its next offset through here.
 */
export const artifactPageSize = 50;

export function nextArtifactOffset(
    lastPage: readonly unknown[],
    pages: readonly (readonly unknown[])[]
): number | undefined {
    return lastPage.length < artifactPageSize ? undefined : pages.length * artifactPageSize;
}
