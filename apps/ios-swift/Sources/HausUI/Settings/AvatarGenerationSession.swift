import Foundation
import Observation

/// One Agent's avatar generation session: the concept being drafted, every
/// variant generated so far, which page the stage shows, and the latest run.
///
/// The session outlives the generator sheet. `SettingsSheet` keeps one per
/// Agent, so closing the sheet never throws work away — a run in flight keeps
/// going and lands as a new page, and reopening resumes where the human left
/// off. It resets the next time the sheet opens after a successful save, so the
/// closing sheet does not flash empty. Mirrors the App's
/// `avatar-generation-session.ts`.
@MainActor
@Observable
final class AvatarGenerationSession {
    enum Run: Equatable {
        case generating(id: Int)
        case failed(id: Int, message: String)

        var id: Int {
            switch self {
            case let .generating(id), let .failed(id, _): id
            }
        }
    }

    struct Variant: Identifiable, Equatable {
        let id: Int
        let payload: AvatarImagePayload
    }

    /// A stage page: one variant, or the latest run while it draws or after it fails.
    enum Page: Hashable {
        case variant(Int)
        case latestRun
    }

    var concept = "" {
        didSet {
            if concept.count > AvatarGenerationConcept.maxLength {
                concept = String(concept.prefix(AvatarGenerationConcept.maxLength))
            }
        }
    }

    private(set) var variants: [Variant] = []
    /// The newest run, or nil before the first one, after it lands, and after a save.
    private(set) var run: Run?
    private(set) var selection: Page?
    private(set) var isSaving = false
    private(set) var saved = false
    /// Failure of the last save; tied to the shown variant, not to generation.
    var saveError: String?

    /// Run ids never repeat, which is what lets a superseded result be dropped.
    private var lastRunID = 0
    private var generation: Task<Void, Never>?

    init() {}

    /// Pages in order: every variant, then the latest run.
    var pages: [Page] {
        let variantPages = variants.map { Page.variant($0.id) }
        return run == nil ? variantPages : variantPages + [.latestRun]
    }

    /// The page on stage. A selection that no longer exists falls to the last page.
    var shownPage: Page? {
        if let selection, pages.contains(selection) {
            return selection
        }
        return pages.last
    }

    var shownPageIndex: Int? {
        shownPage.flatMap { pages.firstIndex(of: $0) }
    }

    /// The variant Save would apply: only ever the one on stage.
    var shownVariant: Variant? {
        guard case let .variant(id) = shownPage else { return nil }
        return variants.first { $0.id == id }
    }

    var isGenerating: Bool {
        if case .generating = run { return true }
        return false
    }

    var canGenerate: Bool {
        !AvatarGenerationConcept.normalized(concept).isEmpty && !isGenerating && !isSaving
    }

    var canSave: Bool {
        shownVariant != nil && !isSaving
    }

    /// Called each time the generator sheet opens.
    func opened() {
        guard saved else { return }
        generation?.cancel()
        generation = nil
        concept = ""
        variants = []
        run = nil
        selection = nil
        saveError = nil
        saved = false
    }

    func select(_ page: Page) {
        guard page != selection else { return }
        selection = page
        saveError = nil
    }

    /// Pages `delta` steps from the shown page, wrapping at both ends.
    func page(by delta: Int) {
        let pages = pages
        guard pages.count > 1, let index = shownPageIndex else { return }
        select(pages[(index + delta % pages.count + pages.count) % pages.count])
    }

    func generate(using draw: @escaping @Sendable (String) async throws -> AvatarImagePayload) {
        guard canGenerate else { return }
        let concept = AvatarGenerationConcept.normalized(concept)
        let runID = startRun()
        generation = Task { [weak self] in
            do {
                let payload = try await draw(concept)
                self?.receive(payload, runID: runID)
            } catch is CancellationError {
                return
            } catch {
                self?.fail(error.localizedDescription, runID: runID)
            }
        }
    }

    /// Saves the shown variant. Returns whether the sheet may close.
    func save(using apply: @Sendable (AvatarImagePayload) async throws -> Void) async -> Bool {
        guard canSave, let variant = shownVariant else { return false }
        isSaving = true
        saveError = nil
        defer { isSaving = false }
        do {
            try await apply(variant.payload)
        } catch is CancellationError {
            return false
        } catch {
            saveError = error.localizedDescription
            return false
        }
        // Dropping the run is what keeps a result still in flight from landing
        // in a session whose avatar was already chosen.
        generation?.cancel()
        generation = nil
        run = nil
        saved = true
        return true
    }

    // MARK: Transitions

    @discardableResult
    func startRun() -> Int {
        lastRunID += 1
        run = .generating(id: lastRunID)
        selection = .latestRun
        saveError = nil
        return lastRunID
    }

    func receive(_ payload: AvatarImagePayload, runID: Int) {
        guard isCurrent(runID) else { return }
        let variant = Variant(id: runID, payload: payload)
        variants.append(variant)
        run = nil
        // Follow the new variant only if the human was waiting on it; someone
        // comparing earlier variants keeps their place.
        if selection == .latestRun {
            selection = .variant(variant.id)
        }
    }

    func fail(_ message: String, runID: Int) {
        guard isCurrent(runID) else { return }
        run = .failed(id: runID, message: message)
    }

    /// A stale result — from a run superseded by a save or a newer run — never lands.
    private func isCurrent(_ runID: Int) -> Bool {
        !saved && run == .generating(id: runID)
    }
}
