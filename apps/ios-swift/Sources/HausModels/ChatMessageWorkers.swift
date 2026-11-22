import Foundation

/// The Cloud Agent work a Message shows, read the same way on every surface
/// that draws a Message (ADR 0044).
extension ChatMessage {
    /// The content to draw: a trailing paragraph of links the cards below
    /// already show is hidden, and anything else stays as written.
    public var displayContent: String {
        WorkerMarkdownLink.elidingBackedTrailingParagraph(
            content,
            backedWorkIDs: Set(cloudAgentWork.map(\.id))
        )
    }
}
