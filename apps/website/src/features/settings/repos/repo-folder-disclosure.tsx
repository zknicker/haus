export function RepoFolderDisclosure() {
    return (
        <>
            {'Workers and Captains work in git worktrees of this folder and share its '}
            <code>.git</code>
            {'. A Worker can change its branches, including '}
            <code>main</code>
            {', and its hooks and config.'}
        </>
    );
}
