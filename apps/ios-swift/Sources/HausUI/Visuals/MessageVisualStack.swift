import SwiftUI

/// The visual cards a message drew, then the artifact pages it linked, under
/// its prose and in the order it wrote them — the web's placement, where every
/// text segment concatenates into one prose block above all the cards.
///
/// The Nth fence in a message is that visual's identity: content only ever
/// appends while a reply streams, so ordinals never reorder. The `id` retires a
/// recycled cell's card state with the visual it belonged to.
struct MessageVisualStack: View {
    /// The most cards one message draws. Each card is a `WKWebView`, and a web
    /// view is a WebContent process; a message that emits a long run of fences
    /// would otherwise cost one process per fence with no ceiling. Past this the
    /// extra fences render as nothing at all — the prose above already excludes
    /// them, so the row shows what the message said and stops.
    static let maxRenderedVisuals = 6

    let message: MessagePresentation
    let heights: VisualHeightRegistry
    var topPadding: CGFloat = 0

    var body: some View {
        ForEach(message.visuals.prefix(Self.maxRenderedVisuals)) { visual in
            let key = VisualKey(messageID: message.id, ordinal: visual.ordinal)
            VisualCard(visual: visual, key: key, heights: heights)
                .id(key)
                .padding(.top, topPadding)
        }
        // A card reads nothing until it is opened, so it costs no web view and
        // needs no cap. The page lives in the author's workspace.
        ForEach(message.artifacts) { artifact in
            ArtifactCard(artifact: artifact, agentID: message.author.id)
                .padding(.top, message.prose.isEmpty && message.visuals.isEmpty && artifact.ordinal == 1 ? 0 : 6)
        }
    }
}
