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
            activeTaskChatIDs: [],
            limit: 2
        )

        #expect(items.map(\.id) == ["dm_new", "project"])
    }

    @Test("A Captain chat the reader joined fills Recent like a DM; one they never joined does not")
    func captainChatsJoinRecentByMembership() {
        let chats = [
            chat("joined", kind: "captain", minutesAgo: 3, captainChat: #"{"member":true,"subscribed":true}"#),
            chat("other", kind: "captain", minutesAgo: 1, captainChat: #"{"member":false,"subscribed":false}"#),
        ]

        let items = HomeRecent.items(chats: chats, unreadChatIDs: [], unreadTasks: [], activeTaskChatIDs: [])

        #expect(items.map(\.id) == ["joined"])
    }

    @Test("Unread is never cut by the limit")
    func unreadOverflowsTheLimit() {
        let chats = (0..<4).map { chat("c\($0)", kind: "channel", minutesAgo: $0) }

        let items = HomeRecent.items(
            chats: chats,
            unreadChatIDs: Set(chats.map(\.id)),
            unreadTasks: [],
            activeTaskChatIDs: [],
            limit: 2
        )

        #expect(items.count == 4)
    }

    @Test("An unread followed Task shows in Recent unless the active Tasks already list it")
    func unreadTaskChats() {
        let listed = taskPreview(chatID: "chat_listed", minutesAgo: 1)
        let archived = taskPreview(chatID: "chat_archived", minutesAgo: 5)

        let items = HomeRecent.items(
            chats: [],
            unreadChatIDs: [],
            unreadTasks: [listed, archived],
            activeTaskChatIDs: ["chat_listed"]
        )

        #expect(items.map(\.id) == ["chat_archived"])
    }

    @Test("A DM with no message yet stays out of Recent")
    func emptyDMIsNotRecent() {
        let items = HomeRecent.items(
            chats: [chat("dm_empty", kind: "dm", minutesAgo: nil)],
            unreadChatIDs: [],
            unreadTasks: [],
            activeTaskChatIDs: []
        )

        #expect(items.isEmpty)
    }

    @Test("Active Task counts group by Project and skip archived Tasks")
    func activeTaskCounts() {
        let tasks = [
            task("t1", archived: false, projectID: "chat_a"),
            task("t2", archived: false, projectID: "chat_a"),
            task("t3", archived: true, projectID: "chat_a"),
            task("t4", archived: false, projectID: "chat_b"),
        ]

        #expect(ProjectTaskCounts.active(tasks) == ["chat_a": 2, "chat_b": 1])
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

    private func chat(_ id: String, kind: String, minutesAgo: Int?, captainChat: String = "null") -> ChatSummary {
        let lastMessage = minutesAgo.map { minutes in
            #"{"authorDisplayName":"Mia","content":"hi","createdAt":"\#(timestamp(minutesAgo: minutes))"}"#
        } ?? "null"
        let peerAgent = kind == "captain" ? #""agent_\#(id)""# : "null"
        return decode(
            """
            {"archivedAt":null,"archivedByUserId":null,"captainChat":\(captainChat),"color":null,
             "createdAt":"2026-01-01T00:00:00Z","description":null,"icon":null,"id":"\(id)","isAll":false,
             "kind":"\(kind)","lastActivityAt":null,"lastMessage":\(lastMessage),"lastMessageSequence":1,
             "name":"\(id)","participantAgentIds":[],"participantUserIds":[],"peerAgentDisplayName":null,
             "peerAgentId":\(peerAgent),"peerAgentRetired":false,"peerUserId":null,"serverId":"srv_a","unreadCount":0}
            """
        )
    }

    private func taskPreview(chatID: String, minutesAgo: Int) -> ChatUnreadPreview {
        decode(
            """
            {"chatId":"\(chatID)","earlierUnreadCount":1,"messages":[],
             "task":{"archivedAt":null,"projectId":"chat_a","shortId":"k3mq7xta","taskId":"task_\(chatID)","title":"Rotate"}}
            """
        )
    }

    private func task(_ id: String, archived: Bool, projectID: String) -> TaskRecord {
        let archivedAt = archived ? #""2026-11-04T00:00:00Z""# : "null"
        return decode(
            """
            {"activity":"idle","agentId":null,"archivedAt":\(archivedAt),"captainId":null,"chatId":"chat_\(id)",
             "computerId":null,"createdAt":"2026-11-03T00:00:00Z","createdBy":{"kind":"user","userId":"user_1"},
             "description":"","id":"\(id)","model":null,"needsYou":false,"origin":null,"projectId":"\(projectID)",
             "serverId":"srv_a","shortId":"k3mq7xta","title":"Rotate tokens","titleCustom":false,
             "updatedAt":"2026-11-03T00:00:00Z","version":1}
            """
        )
    }

    private func project(_ chatID: String, archived: Bool = false) -> Project {
        decode(
            """
            {"archived":\(archived),"chatId":"\(chatID)","defaultMachine":null,"homeAgentIds":[],"isHaus":false,
             "key":"SEC","keyEditable":true,"name":"sec","serverId":"srv_a","taskKeyId":"key_\(chatID)"}
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
