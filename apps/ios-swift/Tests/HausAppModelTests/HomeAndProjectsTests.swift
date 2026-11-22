import Foundation
import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Home and Projects")
struct HomeAndProjectsTests {
    private let scope = ServerScope(serverID: "srv_a")

    @Test("Every unread conversation shows, newest first, and read DMs fill the rest")
    func recentKeepsUnreadAndFillsWithDMs() {
        let chats = [
            chat("dm_old", kind: "dm", minutesAgo: 300),
            chat("project", kind: "channel", minutesAgo: 60),
            chat("dm_new", kind: "dm", minutesAgo: 2),
            chat("quiet_project", kind: "channel", minutesAgo: 1),
        ]

        let items = HomeRecent.items(
            chats: chats,
            unreadChatIDs: ["project"],
            unreadTasks: [],
            openTaskChatIDs: [],
            limit: 2
        )

        #expect(items.map(\.id) == ["dm_new", "project"])
    }

    @Test("Unread is never cut by the limit")
    func unreadOverflowsTheLimit() {
        let chats = (0..<4).map { chat("c\($0)", kind: "channel", minutesAgo: $0) }

        let items = HomeRecent.items(
            chats: chats,
            unreadChatIDs: Set(chats.map(\.id)),
            unreadTasks: [],
            openTaskChatIDs: [],
            limit: 2
        )

        #expect(items.count == 4)
    }

    @Test("An unread followed Task shows in Recent unless Open tasks already lists it")
    func unreadTaskChats() {
        let listed = taskPreview(chatID: "chat_listed", minutesAgo: 1)
        let closed = taskPreview(chatID: "chat_closed", minutesAgo: 5)

        let items = HomeRecent.items(
            chats: [],
            unreadChatIDs: [],
            unreadTasks: [listed, closed],
            openTaskChatIDs: ["chat_listed"]
        )

        #expect(items.map(\.id) == ["chat_closed"])
    }

    @Test("A DM with no message yet stays out of Recent")
    func emptyDMIsNotRecent() {
        let items = HomeRecent.items(
            chats: [chat("dm_empty", kind: "dm", minutesAgo: nil)],
            unreadChatIDs: [],
            unreadTasks: [],
            openTaskChatIDs: []
        )

        #expect(items.isEmpty)
    }

    @Test("Open Task counts group by Project and skip todo Tasks")
    func openTaskCounts() {
        let tasks = [
            task("t1", state: "open", projectID: "chat_a"),
            task("t2", state: "open", projectID: "chat_a"),
            task("t3", state: "todo", projectID: "chat_a"),
            task("t4", state: "open", projectID: "chat_b"),
        ]

        #expect(ProjectTaskCounts.open(tasks) == ["chat_a": 2, "chat_b": 1])
    }

    @Test("Projects stay unknown until read, an older read never replaces a newer one, and a switch drops both")
    func projectsReadOrdering() throws {
        let projects = ProjectsModel(client: AppModelFixtures.client, scope: scope)
        #expect(projects.projects == nil)
        #expect(projects.archivedCount == nil)

        let older = try projects.beginRead()
        let newer = try projects.beginRead()
        #expect(projects.landProjects([project("chat_a", archived: true), project("chat_b")], for: newer))
        #expect(!projects.landProjects([], for: older))
        #expect(projects.archivedCount == 1)
        #expect(projects.project(chatID: "chat_b")?.id == "chat_b")

        let stale = try projects.beginRead()
        scope.activate("srv_b")
        projects.reset()
        #expect(!projects.landProjects([project("chat_c")], for: stale))
        #expect(projects.projects == nil)
    }

    private func chat(_ id: String, kind: String, minutesAgo: Int?) -> ChatSummary {
        let lastMessage = minutesAgo.map { minutes in
            #"{"authorDisplayName":"Mia","content":"hi","createdAt":"\#(timestamp(minutesAgo: minutes))"}"#
        } ?? "null"
        return decode(
            """
            {"archivedAt":null,"archivedByUserId":null,"color":null,"createdAt":"2026-01-01T00:00:00Z",
             "description":null,"icon":null,"id":"\(id)","isAll":false,"kind":"\(kind)","lastActivityAt":null,
             "lastMessage":\(lastMessage),"lastMessageSequence":1,"name":"\(id)","participantAgentIds":[],
             "participantUserIds":[],"peerAgentDisplayName":null,"peerAgentId":null,"peerAgentRetired":false,
             "peerUserId":null,"serverId":"srv_a","unreadCount":0}
            """
        )
    }

    private func taskPreview(chatID: String, minutesAgo: Int) -> ChatUnreadPreview {
        decode(
            """
            {"chatId":"\(chatID)","earlierUnreadCount":1,"messages":[],
             "task":{"taskId":"task_\(chatID)","key":"SEC-1","title":"Rotate","state":"done","projectId":"chat_a"}}
            """
        )
    }

    private func task(_ id: String, state: String, projectID: String) -> TaskRecord {
        decode(
            """
            {"assignee":null,"chatId":"chat_\(id)","completedAt":null,"createdAt":"2026-11-03T00:00:00Z",
             "createdBy":null,"description":"","dueOn":null,"id":"\(id)","key":"SEC-1","labelIds":[],"number":1,
             "origin":null,"priority":"none","projectId":"\(projectID)","serverId":"srv_a","state":"\(state)",
             "title":"Rotate tokens","updatedAt":"2026-11-03T00:00:00Z","version":1}
            """
        )
    }

    private func project(_ chatID: String, archived: Bool = false) -> Project {
        decode(
            """
            {"archived":\(archived),"chatId":"\(chatID)","defaultWorkerPlace":null,"homeAgentIds":[],"isHaus":false,
             "key":"SEC","keyEditable":true,"name":"sec","repos":[],"serverId":"srv_a","taskKeyId":"key_\(chatID)"}
            """
        )
    }

    private func timestamp(minutesAgo: Int) -> String {
        Date(timeIntervalSince1970: 1_800_000_000 - Double(minutesAgo * 60)).formatted(.iso8601)
    }

    private func decode<Value: Decodable>(_ json: String) -> Value {
        do {
            return try HausJSON.decoder().decode(Value.self, from: Data(json.utf8))
        } catch {
            preconditionFailure("Invalid fixture: \(error)")
        }
    }
}
