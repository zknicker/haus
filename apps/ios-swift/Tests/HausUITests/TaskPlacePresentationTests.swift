import Foundation
import HausModels
@testable import HausUI
import Testing

struct TaskPlacePresentationTests {
    // MARK: - Status words

    @Test func runStatusesReadAsWords() {
        let labels = [
            CloudAgentStatus.queued, .running, .completed, .failed, .cancelled, .expired, .pendingInput,
        ].map(CloudAgentPresentation.runStatusLabel)
        #expect(labels == ["Queued", "Running", "Completed", "Failed", "Stopped", "Expired", "Waiting on you"])
        #expect(!labels.contains { $0.contains("_") })
    }

    @Test func taskStatesReadAsTheAppSaysThem() {
        let labels = [TaskState.todo, .open, .done, .canceled, .unknown].map(TaskStateLabel.text)
        #expect(labels == ["Todo", "Open", "Done", "Canceled", "Unknown state"])
    }

    @Test func pullRequestFactsReadAsWords() throws {
        let reading = CloudAgentPullRequestReading(
            number: 42, repository: "haus/haus", state: "merged", checks: "failing", review: "changes-requested",
            title: "Rate-limit webhooks", url: "https://github.com/haus/haus/pull/42", changedFiles: 1
        )
        let pullRequest = TaskPullRequestPresentation(reading: reading)
        #expect(pullRequest.title == "PR #42 · Rate-limit webhooks")
        #expect(pullRequest.stateLabel == "Merged")
        #expect(pullRequest.facts == "Checks failing · Changes requested · 1 file")
        #expect(TaskPullRequestPresentation.checksLabel("someday") == "Checks unknown")
        #expect(TaskPullRequestPresentation.stateLabel("someday") == "Unknown state")
    }

    // MARK: - Attached work

    @Test func theHeaderReadsTheNewestRun() throws {
        let agent = try CloudAgentWorkFixture.work(
            status: "pending_input",
            job: CloudAgentWorkFixture.Job.pendingInput(question: "Which key?"),
            runs: [run(id: "run_new", status: "pending_input", summary: "Paused: **which** key should rotate?"),
                   run(id: "run_old", status: "completed", summary: "Earlier run")]
        )
        #expect(agent.newestRun?.runId == "run_new")
        #expect(agent.runStatusText == "Waiting on you")
        #expect(agent.newestRunSummary == "Paused: which key should rotate?")
    }

    @Test func aPullRequestShownByItsCloudAgentIsNotRepeated() throws {
        let agent = try CloudAgentWorkFixture.work(runs: [
            CloudAgentWorkFixture.run(branches: [CloudAgentWorkFixture.branch(url: "https://github.com/haus/haus/pull/482")]),
        ])
        let work = TaskAttachedWorkPresentation(cloudAgents: [agent], pullRequests: [
            CloudAgentPullRequestReading(number: 482, repository: "haus/haus", state: "open", url: "https://github.com/haus/haus/pull/482"),
            CloudAgentPullRequestReading(number: 7, repository: "haus/haus", state: "draft", url: "https://github.com/haus/haus/pull/7"),
        ])
        #expect(work.pullRequests.map(\.reading.number) == [7])
        #expect(!work.isEmpty)
        #expect(TaskAttachedWorkPresentation.empty.isEmpty)
    }

    // MARK: - Origin preview

    @Test func aPreviewQuotesUpToThreeResolvedMessagesAndStatesItsCounts() throws {
        let preview = TaskPreview(
            taskID: "task_12", chatID: "chat_task_12", key: "SEC-12", title: "Rate-limit", state: .open,
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
        #expect(presentation.summaryLine == "Open · 9 messages · 2 new")
        #expect(presentation.accessibilityLabel == "Open task SEC-12, Rate-limit, Open, 9 messages, 2 new")
    }

    @Test func aQuietPreviewSaysNothingNew() {
        let presentation = TaskPreviewPresentation(
            taskID: "t", chatID: "c", key: "SEC-1", title: "One", state: .done,
            messageCount: 1, unreadCount: 0, recentMessages: []
        )
        #expect(presentation.messagesLabel == "1 message")
        #expect(presentation.unreadLabel == nil)
        #expect(presentation.summaryLine == "Done · 1 message")
    }

    @Test func previewsLandUnderTheirOriginMessage() {
        let previews = [
            TaskPreview(taskID: "a", chatID: "ca", key: "SEC-1", title: "A", state: .open, originMessageID: "m1", messageCount: 1),
            TaskPreview(taskID: "b", chatID: "cb", key: "SEC-2", title: "B", state: .todo, originMessageID: "m1", messageCount: 0),
        ]
        let grouped = TaskPreviewProjection.presentations(previews) { _ in nil }
        #expect(grouped["m1"]?.map(\.key) == ["SEC-1", "SEC-2"])
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

    // MARK: - Inbox

    @Test func anUnreadTaskIsAnUnreadRowThatOpensTheTask() {
        let rows = InboxUnreadRows.rows(
            [InboxFixtures.chat(id: "chat_old", name: "product", lastActivityAt: Date(timeIntervalSince1970: 1_800_000_100))],
            taskChats: [taskChat(at: Date(timeIntervalSince1970: 1_800_000_200))],
            viewerDisplayName: "Marlow"
        )
        #expect(rows.map(\.id) == ["chat_task_12", "chat_old"])
        let row = rows[0]
        #expect(row.open == .task(taskID: "task_12"))
        #expect(row.preview == "Forge: Done")
        #expect(rows[1].facts == nil)
    }

    @Test func anUnreadTaskRowKeepsItsWholeTitleAndPutsKeyAndStateUnderIt() {
        let title = "Rate-limit the Trigger webhooks before the partner launch on Thursday"
        let row = taskChat(at: Date(timeIntervalSince1970: 1_800_000_200), title: title, state: .todo)
            .row(viewerDisplayName: "Marlow")
        #expect(row.title == title)
        #expect(row.facts == "SEC-12 · Todo")
        #expect(!row.title.contains("SEC-12"))
    }

    private func taskChat(
        at date: Date,
        title: String = "Rate-limit",
        state: TaskState = .open
    ) -> InboxUnreadTaskChat {
        InboxUnreadTaskChat(
            id: "chat_task_12", taskID: "task_12", key: "SEC-12", title: title, state: state,
            mark: .channel(ChannelAppearance(icon: nil, color: nil)), lastActivityAt: date,
            latestMessage: InboxFixtures.lastMessage(author: "Forge", content: "Done")
        )
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

    private func run(id: String, status: String, summary: String) -> String {
        """
        {"branches":[],"createdAt":"\(CloudAgentWorkFixture.start)","errorCode":null,"runId":"\(id)",
         "startedAt":"\(CloudAgentWorkFixture.start)","status":"\(status)","summary":"\(summary)","terminalAt":null}
        """
    }
}
