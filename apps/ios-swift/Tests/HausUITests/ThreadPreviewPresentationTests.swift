import Foundation
import HausModels
@testable import HausUI
import Testing

struct ThreadPreviewPresentationTests {
    @Test func keepsEveryRecentReplyInServerOrder() {
        let preview = ThreadPreviewProjection.presentation(for: summary(replyIDs: ["a", "b", "c"])) {
            MessageAuthorPresentation(id: $0.authorUserID ?? "unknown", name: "Zach", avatarURL: nil)
        }

        #expect(preview.threadChatID == "thread_1")
        #expect(preview.replyCount == 3)
        #expect(preview.unreadCount == 1)
        #expect(preview.recentReplies.map(\.id) == ["a", "b", "c"])
        #expect(preview.recentReplies.map(\.content) == ["reply a", "reply b", "reply c"])
        #expect(preview.latestReply?.id == "c")
        #expect(preview.latestReply?.author.name == "Zach")
    }

    @Test func dropsRepliesWhoseAuthorTheDirectoriesCannotResolve() {
        let preview = ThreadPreviewProjection.presentation(for: summary(replyIDs: ["a", "b"])) { reply in
            reply.id == "a"
                ? MessageAuthorPresentation(id: "zach", name: "Zach", avatarURL: nil)
                : nil
        }

        #expect(preview.recentReplies.map(\.id) == ["a"])
    }

    @Test func yieldsNoRowsWhenTheServerSentNoRecentReplies() {
        let preview = ThreadPreviewProjection.presentation(for: summary(replyIDs: [])) { _ in
            MessageAuthorPresentation(id: "zach", name: "Zach", avatarURL: nil)
        }

        #expect(preview.recentReplies.isEmpty)
        #expect(preview.latestReply == nil)
    }

    @Test func latestPreviewAdvancesWithoutChangingReplyIdentityOnRefresh() {
        func project(_ ids: [String]) -> ThreadPreviewPresentation {
            ThreadPreviewProjection.presentation(for: summary(replyIDs: ids)) {
                MessageAuthorPresentation(id: $0.authorUserID!, name: "Zach", avatarURL: nil)
            }
        }
        let initial = project(["a", "b"])
        let refreshed = project(["a", "b"])
        let appended = project(["a", "b", "c"])
        #expect(initial.latestReply == refreshed.latestReply)
        #expect(initial.latestReply?.id != appended.latestReply?.id)
        #expect(appended.latestReply?.content == "reply c")
    }

    @Test func labelsTheReplyCount() {
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasClaim: false) == "Reply in thread")
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 0, hasClaim: true) == nil)
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 1, hasClaim: false) == "1 reply")
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 2, hasClaim: false) == "2 replies")
        #expect(ThreadPreviewProjection.replyLabel(replyCount: 2, hasClaim: true) == "2 replies")
    }

    /// The Server sends recent replies oldest first, so the fixture is written
    /// in that order and the projection must not reorder or trim it.
    private func summary(replyIDs: [String]) -> ThreadSummary {
        let replies = replyIDs.map { id in
            """
            {"authorAgentId":null,"authorUserId":"user_1","content":"reply \(id)",\
            "createdAt":"2026-01-01T00:00:00Z","id":"\(id)"}
            """
        }
        let json = """
        {"anchorMessageId":"message_1","followed":true,"latestReplyAt":"2026-01-01T00:00:00Z",\
        "recentReplies":[\(replies.joined(separator: ","))],"replyCount":\(replyIDs.count),\
        "threadChatId":"thread_1","unreadCount":1}
        """
        do {
            return try HausJSON.decoder().decode(ThreadSummary.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid thread summary fixture: \(error)")
        }
    }
}
