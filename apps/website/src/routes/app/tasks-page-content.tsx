import { ClaimContent } from '../../features/servers/claims/claim-content.tsx';
import { ClaimThreadDialog } from '../../features/servers/claims/claim-thread-dialog.tsx';
import { useClaimView } from '../../features/servers/claims/claim-view.ts';

export function TasksPageContent() {
    const { openClaim } = useClaimView();
    return (
        <>
            <ClaimContent onOpenClaim={(claim) => openClaim(claim.id)} />
            <ClaimThreadDialog />
        </>
    );
}
