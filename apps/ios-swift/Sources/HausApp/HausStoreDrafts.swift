import HausAppModel
import HausUI
import SwiftUI

/// Composer drafts and staged attachments, keyed by the active Server and the
/// destination (`ComposerDraftStore`).
extension HausStore {
    func draftBinding(for destination: ComposerDestination) -> Binding<String> {
        guard let key = draftKey(destination) else { return .constant("") }
        let drafts = drafts
        return Binding(
            get: { drafts.text(for: key) },
            set: { text in
                if text.isEmpty, !drafts.text(for: key).isEmpty {
                    Self.logger.notice("Draft emptied for \(String(describing: destination), privacy: .public)")
                }
                drafts.setText(text, for: key)
            }
        )
    }

    /// Each non-empty draft's destination and length, for the pose log.
    var draftSummary: String {
        let summary = drafts.texts.map { "\($0.key.destination)=\($0.value.count)" }.sorted().joined(separator: ", ")
        return summary.isEmpty ? "none" : summary
    }

    func composerInteraction(for destination: ComposerDestination) -> ComposerInteraction {
        guard let key = draftKey(destination) else { return ComposerInteraction() }
        return drafts.staged(for: key)
    }

    /// Where a conversation's composer sends: the Task beside it until its
    /// chip is let go (`ComposerDraftStore.target`).
    func composerTarget(_ conversation: ComposerDestination, beside taskID: String?) -> ComposerDestination {
        guard let key = draftKey(conversation) else { return conversation }
        return drafts.target(key, beside: taskID)
    }

    func releaseComposerTarget(_ conversation: ComposerDestination, from taskID: String) {
        guard let key = draftKey(conversation) else { return }
        drafts.release(key, from: taskID)
    }

    private func draftKey(_ destination: ComposerDestination) -> ComposerDraftKey? {
        activeServer.map { ComposerDraftKey(serverID: $0.id, destination: destination) }
    }
}
