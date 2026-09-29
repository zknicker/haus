import Foundation
import Testing
@testable import HausUI

@Suite("Avatar generation session")
@MainActor
struct AvatarGenerationSessionTests {
    private func payload(_ byte: UInt8) -> AvatarImagePayload {
        AvatarImagePayload(data: Data([byte]), mediaType: .png)
    }

    /// A session holding one landed variant, as after the first generate.
    private func sessionWithFirstVariant() -> AvatarGenerationSession {
        let session = AvatarGenerationSession()
        session.concept = "a fox mechanic"
        let run = session.startRun()
        session.receive(payload(1), runID: run)
        return session
    }

    @Test("regenerating keeps earlier variants selectable and shows the newest")
    func keepsEveryVariant() {
        let session = sessionWithFirstVariant()
        session.receive(payload(2), runID: session.startRun())

        #expect(session.variants.map(\.payload) == [payload(1), payload(2)])
        #expect(session.shownVariant?.payload == payload(2))

        session.select(.variant(1))
        #expect(session.shownVariant?.payload == payload(1))
    }

    @Test("a result keeps a human who paged back to an earlier variant in place")
    func resultOnlyFollowsTheWaitingPage() {
        let session = sessionWithFirstVariant()
        let run = session.startRun()
        session.select(.variant(1))
        session.receive(payload(2), runID: run)

        #expect(session.variants.count == 2)
        #expect(session.shownPage == .variant(1))
    }

    @Test("a failed regenerate keeps every variant and shows the failure as a page")
    func failedRunKeepsVariants() {
        let session = sessionWithFirstVariant()
        let run = session.startRun()
        session.fail("The image provider is unavailable.", runID: run)

        #expect(session.variants.count == 1)
        #expect(session.shownPage == .latestRun)
        #expect(session.shownVariant == nil)
        #expect(!session.canSave)
        #expect(session.run == .failed(id: run, message: "The image provider is unavailable."))

        session.select(.variant(1))
        #expect(session.shownVariant?.id == 1)
        #expect(session.canSave)
    }

    @Test("save is disabled while the pending page is shown")
    func pendingPageCannotSave() {
        let session = sessionWithFirstVariant()
        session.startRun()
        #expect(session.shownPage == .latestRun)
        #expect(!session.canSave)
        #expect(!session.canGenerate)
    }

    @Test("save applies the variant on stage")
    func saveUsesShownVariant() async {
        let session = sessionWithFirstVariant()
        session.receive(payload(2), runID: session.startRun())
        session.select(.variant(1))

        let applied = Applied()
        let closed = await session.save { await applied.record($0) }

        #expect(closed)
        #expect(await applied.payloads == [payload(1)])
    }

    @Test("a save error clears when save is retried or another page is shown")
    func saveErrorBelongsToSave() async {
        let session = sessionWithFirstVariant()
        session.receive(payload(2), runID: session.startRun())

        let closed = await session.save { _ in throw SaveFailure() }
        #expect(!closed)
        #expect(session.saveError == "Avatar storage is unavailable.")
        #expect(session.run == nil)

        session.select(.variant(1))
        #expect(session.saveError == nil)
    }

    @Test("a result arriving after save is dropped and the session resets on reopen")
    func resultAfterSaveIsDropped() async {
        let session = sessionWithFirstVariant()
        let run = session.startRun()
        session.select(.variant(1))
        #expect(await session.save { _ in })

        session.receive(payload(2), runID: run)
        #expect(session.variants.count == 1)
        #expect(session.run == nil)

        session.opened()
        #expect(session.variants.isEmpty)
        #expect(session.concept.isEmpty)
        #expect(session.shownPage == nil)
    }

    @Test("reopening an unsaved session resumes it, run and all")
    func reopenResumes() {
        let session = sessionWithFirstVariant()
        let run = session.startRun()
        session.opened()

        #expect(session.isGenerating)
        session.receive(payload(2), runID: run)
        #expect(session.shownVariant?.id == run)
    }

    @Test("a superseded run cannot overwrite the newer one")
    func staleRunIsDropped() {
        let session = AvatarGenerationSession()
        let first = session.startRun()
        let second = session.startRun()
        session.fail("Old failure.", runID: first)
        session.receive(payload(9), runID: first)

        #expect(session.run == .generating(id: second))
        #expect(session.variants.isEmpty)
    }

    @Test("paging walks variants then the latest run, wrapping at both ends")
    func pagingWraps() {
        let session = sessionWithFirstVariant()
        session.receive(payload(2), runID: session.startRun())
        session.fail("Busy.", runID: session.startRun())

        #expect(session.pages == [.variant(1), .variant(2), .latestRun])
        #expect(session.shownPageIndex == 2)

        session.page(by: 1)
        #expect(session.shownPage == .variant(1))
        session.page(by: -1)
        #expect(session.shownPage == .latestRun)
        session.page(by: -1)
        #expect(session.shownVariant?.payload == payload(2))
    }
}

private struct SaveFailure: LocalizedError {
    var errorDescription: String? { "Avatar storage is unavailable." }
}

private actor Applied {
    private(set) var payloads: [AvatarImagePayload] = []

    func record(_ payload: AvatarImagePayload) {
        payloads.append(payload)
    }
}
