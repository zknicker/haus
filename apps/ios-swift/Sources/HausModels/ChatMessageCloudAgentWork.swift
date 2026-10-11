import Foundation

/// The Cloud Agent work a Message shows, read the same way on every surface
/// that draws a Message (ADR 0044).
extension ChatMessage {
    /// Every work to draw a card for below this Message, in link order: the
    /// recorded links, then a pre-link `cloud-agent-work` body's work when no
    /// link already names it. The body arm goes with the contraction slice.
    public var linkedCloudAgentWork: [CloudAgentWork] {
        guard case .cloudAgentWork(let legacy) = body,
              !cloudAgentWork.contains(where: { $0.id == legacy.id })
        else { return cloudAgentWork }
        return cloudAgentWork + [legacy]
    }

    /// The content to draw: a trailing paragraph of links the cards below
    /// already show is hidden, and anything else stays as written.
    public var displayContent: String {
        CloudAgentWorkLink.elidingBackedTrailingParagraph(
            content,
            backedWorkIDs: Set(cloudAgentWork.map(\.id))
        )
    }

    /// The first linked work's title, which names this Message wherever a
    /// one-line title stands for it (a Thread reference chip).
    public var linkedCloudAgentWorkTitle: String? {
        linkedCloudAgentWork.first?.title
    }
}
