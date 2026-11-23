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
            set: { drafts.setText($0, for: key) }
        )
    }

    func composerInteraction(for destination: ComposerDestination) -> ComposerInteraction {
        guard let key = draftKey(destination) else { return ComposerInteraction() }
        return drafts.staged(for: key)
    }

    private func draftKey(_ destination: ComposerDestination) -> ComposerDraftKey? {
        activeServer.map { ComposerDraftKey(serverID: $0.id, destination: destination) }
    }
}
