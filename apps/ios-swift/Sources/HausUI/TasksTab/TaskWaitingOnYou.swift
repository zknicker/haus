import Foundation
import HausModels

/// The Tasks waiting on the viewer: unfinished Task chats whose unread
/// messages name them, as the App's sidebar reads `mentionsViewer`.
public enum TaskWaitingOnYou {
    public static func taskIDs(in previews: [ChatUnreadPreview], viewerUserID: String) -> Set<String> {
        Set(previews.compactMap { preview -> String? in
            guard let task = preview.task, !task.state.isClosed else { return nil }
            let named = preview.messages.contains { mentions($0.content, userID: viewerUserID) }
            return named ? task.taskID : nil
        })
    }

    static func mentions(_ content: String, userID: String) -> Bool {
        content.matches(of: /\[([^\]\n]+)\]\(([^)\n]+)\)/).contains { match in
            let target = RichReferenceWireForm.read(target: String(match.output.2), text: String(match.output.1))
            return target?.kind == .human && target?.id == userID
        }
    }
}
