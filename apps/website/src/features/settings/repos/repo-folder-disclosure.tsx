export function RepoFolderDisclosure() {
    return (
        <>
            {'Captains and Tasks work in git worktrees of this folder and share its '}
            <code>.git</code>
            {'. A Task can change its branches, including '}
            <code>main</code>
            {', and its hooks and config.'}
        </>
    );
}
