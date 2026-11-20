export function pinnedBehindHead(
    pinnedRevisionId: string | undefined,
    headRevisionId: string | undefined
) {
    return Boolean(pinnedRevisionId && headRevisionId && pinnedRevisionId !== headRevisionId);
}
