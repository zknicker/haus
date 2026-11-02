import Foundation
import HausModels
@testable import HausUI
import Testing

/// A task on a message inside a Thread: stated on that message under the
/// reader's Chat preference, and never a Thread of its own.
struct ThreadTaskMarkTests {
    @Test func hidesAThreadClaimUntilTheReaderAsksForIt() {
        let claim = TaskPresentation(number: 12, origin: .claimed, status: .inProgress, assignee: nil)

        #expect(ThreadTaskMark.stated(claim, showTasksInChat: false) == nil)
        #expect(ThreadTaskMark.stated(claim, showTasksInChat: true) == claim)
    }

    @Test func keepsAThreadTaskAHumanMadeWhateverThePreferenceSays() {
        for origin in [TaskOrigin.composed, .converted] {
            let task = TaskPresentation(number: 12, origin: origin, status: .todo, assignee: nil)

            #expect(ThreadTaskMark.stated(task, showTasksInChat: false) == task)
        }
    }

    @Test func marksNothingOnAReplyWithoutATask() {
        #expect(ThreadTaskMark.stated(nil, showTasksInChat: true) == nil)
        #expect(ThreadTaskMark.stated(nil, showTasksInChat: false, isOpenedTask: true) == nil)
    }

    /// Opened from the Tasks list, the claim is what the reader asked to see.
    @Test func showsTheClaimTheThreadWasOpenedForWhateverThePreferenceSays() {
        let claim = TaskPresentation(number: 12, origin: .claimed, status: .inProgress, assignee: nil)

        #expect(ThreadTaskMark.stated(claim, showTasksInChat: false, isOpenedTask: true) == claim)
    }

    /// The anchor's own task must not stand in for the reply's: the title stops
    /// naming it, and its card names itself instead.
    @Test func stopsTitlingTheThreadForTheAnchorsTaskWhenOpenedForAReplysTask() {
        let author = MessageAuthorPresentation(id: "agent_1", name: "Piper", avatarURL: nil)
        let anchorTask = TaskPresentation(number: 3, origin: .composed, status: .done, assignee: nil)
        let anchor = MessagePresentation(
            id: "message_anchor", author: author, content: "Ship it",
            createdAt: Date(timeIntervalSince1970: 1_767_225_600), task: anchorTask
        )

        #expect(ThreadOpening.title(anchor: anchor) == "Task #3")
        #expect(ThreadOpening.title(anchor: anchor, taskMessageID: "message_anchor") == "Task #3")
        #expect(ThreadOpening.title(anchor: anchor, taskMessageID: "message_reply") == "Thread")
        #expect(ThreadOpening.opensForReplyTask(anchor: anchor, taskMessageID: "message_reply"))
        #expect(!ThreadOpening.opensForReplyTask(anchor: anchor, taskMessageID: nil))
    }

    /// The task message sits in its work surface already; offering a Thread
    /// off it would nest a Thread inside itself.
    @Test func givesAThreadTaskNoThreadPreviewOfItsOwn() throws {
        let task = try messageTask(chatID: "chat_product", threadChatID: "cht_thr_message_anchor")

        #expect(ThreadPreviewProjection.taskThread(task, messageChatID: "cht_thr_message_anchor") == nil)
    }

    @Test func offersATopLevelTaskTheThreadAnchoredOnIt() throws {
        let task = try messageTask(chatID: "chat_product", threadChatID: "cht_thr_message_1")

        let preview = ThreadPreviewProjection.taskThread(task, messageChatID: "chat_product")

        #expect(preview?.threadChatID == "cht_thr_message_1")
        #expect(preview?.replyCount == 0)
    }

    /// The anchor carries the metadata card; a reply carries the mark.
    @Test func keepsAReplysTaskOnTheReplyInTheThreadTranscript() {
        let claim = TaskPresentation(number: 12, origin: .claimed, status: .inProgress, assignee: nil)
        let author = MessageAuthorPresentation(id: "agent_1", name: "Piper", avatarURL: nil)
        let sentAt = Date(timeIntervalSince1970: 1_767_225_600)
        let anchor = MessagePresentation(id: "message_anchor", author: author, content: "Can you pull the numbers?", createdAt: sentAt)
        let reply = MessagePresentation(id: "message_reply", author: author, content: "On it", createdAt: sentAt, task: claim)

        let items = ThreadTranscriptItem.items(anchor: anchor, replies: [reply])

        #expect(items.map(\.id) == ["thread-anchor-message_anchor", "message_reply"])
        #expect(items.last == .reply(reply))
    }

    private func messageTask(chatID: String, threadChatID: String) throws -> MessageTask {
        try HausJSON.decoder().decode(
            MessageTask.self,
            from: Data(
                """
                {"assigneeAgentId":"agent_1","chatId":"\(chatID)","claimedAt":"2026-01-01T00:00:10Z","createdAt":"2026-01-01T00:00:10Z","createdByAgentId":"agent_1","createdByUserId":null,"labels":[],"live":true,"messageId":"message_reply","number":12,"origin":"claimed","priority":"none","status":"in_progress","threadChatId":"\(threadChatID)","tier":"tracked","updatedAt":"2026-01-01T00:00:10Z","version":1}
                """.utf8
            )
        )
    }
}
