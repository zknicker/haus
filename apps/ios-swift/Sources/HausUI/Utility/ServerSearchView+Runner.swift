import Foundation
import Observation

/// One mounted search surface's message search: the latest results for the
/// query it was last run with, and whether that run is still going or failed.
/// The owning view reruns it from `.task(id:)`, which cancels the run before.
@MainActor
@Observable
final class MessageSearchRun {
    private(set) var results: [MessageSearchResultPresentation] = []
    private(set) var hasSearched = false
    private(set) var isSearching = false
    private(set) var error: String?

    func run(_ rawQuery: String, chatID: String?, search: MessageSearch) async {
        let term = rawQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !term.isEmpty else {
            results = []
            hasSearched = false
            isSearching = false
            error = nil
            return
        }

        // Chat matches are already on screen. Keep the current message results
        // while the user is still composing, and only show progress after the
        // debounce, so keyboard input never causes a full-screen loading flash.
        isSearching = false
        hasSearched = false
        error = nil
        do {
            try await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            isSearching = true
            let results = try await search(term, chatID)
            guard !Task.isCancelled else { return }
            self.results = results
            hasSearched = true
            isSearching = false
            error = nil
        } catch is CancellationError {
            // A new keystroke cancels the previous search normally.
        } catch {
            guard !Task.isCancelled else { return }
            hasSearched = true
            isSearching = false
            self.error = error.localizedDescription
        }
    }
}
