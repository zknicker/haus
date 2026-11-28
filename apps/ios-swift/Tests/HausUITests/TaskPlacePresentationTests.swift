import Foundation
import HausModels
@testable import HausUI
import Testing

struct TaskPlacePresentationTests {
    // MARK: - Pull request words

    @Test func pullRequestFactsReadAsWords() {
        let reading = PullRequestReading(
            number: 42, repository: "haus/haus", state: "merged", checks: "failing", review: "changes-requested",
            title: "Rate-limit webhooks", url: "https://github.com/haus/haus/pull/42", changedFiles: 1
        )
        let pullRequest = PullRequestPresentation(reading: reading)
        #expect(pullRequest.title == "Rate-limit webhooks")
        #expect(pullRequest.stateLabel == "Merged")
        #expect(pullRequest.reviewLabel == "Changes requested")
        #expect(pullRequest.checksLabel == "Failing")
        #expect(pullRequest.url?.host() == "github.com")
        #expect(PullRequestPresentation(reading: PullRequestReading(
            number: 1, repository: "haus/haus", state: "someday", url: "ftp://nowhere"
        )).url == nil)
    }

    // MARK: - Chat header

    @Test func theHeaderNamesTheTaskAndItsActivity() {
        let task = TaskRecord(
            id: "t", shortID: "k3mq7xta", title: "Rate-limit", activity: .waiting, needsYou: true,
            projectID: "p", serverID: "s", version: 1, createdAt: .now, updatedAt: .now, createdBy: .user(userID: "u")
        )
        let header = TaskChatHeaderPresentation(task)
        #expect(header.title == "Rate-limit")
        #expect(header.shortID == "k3mq7xta")
        #expect(header.disc.label == "Needs you")
    }

    // MARK: - Origin preview

    @Test func aPreviewQuotesUpToThreeResolvedMessagesAndStatesItsCounts() throws {
        let preview = TaskPreview(
            taskID: "task_12", chatID: "chat_task_12", shortID: "k3mq7xta", title: "Rate-limit",
            originMessageID: "msg_origin",
            recentMessages: try ["m1", "m2", "gone", "m4"].map(reply),
            messageCount: 9, unreadCount: 2, followed: true
        )
        let presentation = TaskPreviewProjection.presentation(for: preview) { reply in
            reply.id == "gone" ? nil : MessageAuthorPresentation(id: "agent_1", name: "Forge", avatarURL: nil)
        }
        #expect(presentation.recentMessages.map(\.id) == ["m2", "m4"])
        #expect(presentation.messagesLabel == "9 messages")
        #expect(presentation.unreadLabel == "2 new")
        #expect(presentation.summaryLine == "9 messages · 2 new")
        #expect(presentation.accessibilityLabel == "Open task, Rate-limit, Active, 9 messages, 2 new")
    }

    @Test func anArchivedQuietPreviewSaysSo() {
        let presentation = TaskPreviewPresentation(
            taskID: "t", chatID: "c", shortID: "k3mq7xta", title: "One", isArchived: true,
            messageCount: 1, unreadCount: 0, recentMessages: []
        )
        #expect(presentation.messagesLabel == "1 message")
        #expect(presentation.unreadLabel == nil)
        #expect(presentation.summaryLine == "Archived · 1 message")
        #expect(presentation.disc == .archived)
    }

    @Test func previewsLandUnderTheirOriginMessage() {
        let previews = [
            TaskPreview(taskID: "a", chatID: "ca", shortID: "aaaaaaaa", title: "A", originMessageID: "m1", messageCount: 1),
            TaskPreview(taskID: "b", chatID: "cb", shortID: "bbbbbbbb", title: "B", originMessageID: "m1", messageCount: 0),
        ]
        let grouped = TaskPreviewProjection.presentations(previews) { _ in nil }
        #expect(grouped["m1"]?.map(\.shortID) == ["aaaaaaaa", "bbbbbbbb"])
    }

    // MARK: - Task transcript

    @Test func startedFromHeadsTheTranscriptOnceTheOldestPageIsLoaded() {
        let origin = TaskStartedFromPresentation(placeLabel: "#security", excerpt: "Forge: Found five issues")
        let messages = [message("m1", at: 0), message("m2", at: 60)]
        let full = TaskTranscriptItem.items(startedFrom: origin, messages: messages, hasOlder: false, calendar: utc)
        #expect(full.map(\.id).first == "task-started-from")
        #expect(full.compactMap(\.message).map(\.id) == ["m1", "m2"])
        let paged = TaskTranscriptItem.items(startedFrom: origin, messages: messages, hasOlder: true, calendar: utc)
        #expect(!paged.contains { $0.id == "task-started-from" })
        #expect(origin.title == "Started from #security")
    }

    @Test func aTaskWithNoMessagesShowsOnlyWhereItStarted() {
        let origin = TaskStartedFromPresentation(placeLabel: "#security", excerpt: nil)
        let items = TaskTranscriptItem.items(startedFrom: origin, messages: [], hasOlder: false, calendar: utc)
        #expect(items.map(\.id) == ["task-started-from"])
    }

    // MARK: - Fixtures

    private var utc: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }

    private func message(_ id: String, at offset: TimeInterval) -> MessagePresentation {
        MessagePresentation(
            id: id,
            author: MessageAuthorPresentation(id: "agent_1", name: "Forge", avatarURL: nil),
            content: "Body \(id)",
            createdAt: Date(timeIntervalSince1970: 1_800_000_000 + offset)
        )
    }

    private func reply(_ id: String) throws -> TaskMessagePreview {
        try HausJSON.decoder().decode(TaskMessagePreview.self, from: Data("""
        {"authorAgentId":"agent_1","authorUserId":null,"content":"Line \(id)","createdAt":"2026-11-17T10:00:00Z","id":"\(id)"}
        """.utf8))
    }
}
