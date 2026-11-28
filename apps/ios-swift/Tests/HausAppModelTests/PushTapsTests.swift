import Foundation
import HausModels
import Testing
@testable import HausAppModel

@MainActor
@Suite("Push taps")
struct PushTapsTests {
    @Test("A Channel message opens the Channel at the message")
    func channelMessage() throws {
        let push = try #require(HausPush(userInfo: message(kind: "channel")))
        #expect(PushRouteTable.request(for: push) == .open(.channel(chatID: "chat_product", messageID: "msg_1")))
    }

    @Test("A DM message opens the DM at the message")
    func dmMessage() throws {
        let push = try #require(HausPush(userInfo: message(kind: "dm")))
        #expect(PushRouteTable.request(for: push) == .open(.dm(chatID: "chat_product", messageID: "msg_1")))
    }

    @Test("A message in a Task's chat opens the Task at the message")
    func taskMessage() throws {
        var userInfo = message(kind: "channel")
        userInfo["chatId"] = "chat_task"
        userInfo["taskId"] = "task_7"
        userInfo["taskShortId"] = "k3mq7xta"
        let push = try #require(HausPush(userInfo: userInfo))
        #expect(PushRouteTable.request(for: push) == .open(.task(taskID: "task_7", messageID: "msg_1")))
    }

    @Test("A Captain chat message opens its Captain's chat at the message")
    func captainMessage() throws {
        var userInfo = message(kind: "captain")
        userInfo["chatId"] = "chat_forge"
        userInfo["conversationChatId"] = "chat_forge"
        let push = try #require(HausPush(userInfo: userInfo))
        let request = PushRouteTable.request(for: push) { $0 == "chat_forge" ? "agent_forge" : nil }
        #expect(request == .open(.captain(agentID: "agent_forge", messageID: "msg_1")))
    }

    @Test("A Captain chat the Chat list does not know yet opens by its Chat id")
    func unknownCaptainMessage() throws {
        let push = try #require(HausPush(userInfo: message(kind: "captain")))
        #expect(PushRouteTable.request(for: push) == .open(.dm(chatID: "chat_product", messageID: "msg_1")))
    }

    @Test("An Issue push opens Home on its Server, since the iPhone has no Issue screen")
    func issuePush() throws {
        let push = try #require(HausPush(userInfo: [
            "kind": "issue_assignment", "code": "GEN-12", "issueId": "iss_1", "serverId": "srv_a",
        ]))
        #expect(push.serverID == "srv_a")
        #expect(PushRouteTable.request(for: push) == .root(.home))
    }

    @Test("A cold-launch tap waits for the router, then routes once")
    func coldLaunchQueues() throws {
        let taps = PushTaps()
        let router = HausRouter()
        taps.receive(try #require(HausPush(userInfo: message(kind: "channel"))))
        #expect(taps.route(into: router, activeServerID: "srv_a", memberServerIDs: ["srv_a"]) == .idle)
        #expect(router.paths.isEmpty)
        taps.mount()
        #expect(taps.route(into: router, activeServerID: "srv_a", memberServerIDs: ["srv_a"]) == .routed)
        #expect(router.selectedTab == .projects)
        #expect(router.path(.projects) == [.channel(chatID: "chat_product", messageID: "msg_1")])
        #expect(taps.pending == nil)
        #expect(taps.route(into: router, activeServerID: "srv_a", memberServerIDs: ["srv_a"]) == .idle)
    }

    @Test("Sign-out discards a tap still waiting for the router")
    func signOutDiscards() throws {
        let taps = PushTaps()
        taps.receive(try #require(HausPush(userInfo: message(kind: "channel"))))
        taps.discard()
        taps.mount()
        #expect(taps.route(into: HausRouter(), activeServerID: "srv_a", memberServerIDs: ["srv_a"]) == .idle)
    }

    @Test("A tap for another Server asks for the switch and stays pending until it routes")
    func crossServerSwitchesFirst() throws {
        let taps = PushTaps()
        let router = HausRouter()
        router.adopt(serverID: "srv_a")
        taps.mount()
        var userInfo = message(kind: "dm")
        userInfo["serverId"] = "srv_b"
        taps.receive(try #require(HausPush(userInfo: userInfo)))
        let members = ["srv_a", "srv_b"]
        #expect(taps.route(into: router, activeServerID: "srv_a", memberServerIDs: members) == .needsSwitch("srv_b"))
        #expect(taps.pending != nil)
        #expect(router.paths.isEmpty)
        router.adopt(serverID: "srv_b")
        #expect(taps.route(into: router, activeServerID: "srv_b", memberServerIDs: members) == .routed)
        #expect(router.path(.home) == [.dm(chatID: "chat_product", messageID: "msg_1")])
        #expect(taps.pending == nil)
    }

    @Test("A tap for a Server the person left is dropped with a notice")
    func lostServerDrops() throws {
        let taps = PushTaps()
        let router = HausRouter()
        taps.mount()
        var userInfo = message(kind: "channel")
        userInfo["serverId"] = "srv_gone"
        taps.receive(try #require(HausPush(userInfo: userInfo)))
        #expect(taps.route(into: router, activeServerID: "srv_a", memberServerIDs: ["srv_a"]) == .dropped)
        #expect(taps.pending == nil)
        #expect(taps.notice != nil)
        #expect(router.paths.isEmpty)
        taps.clearNotice()
        #expect(taps.notice == nil)
    }

    @Test("A newer tap replaces one still waiting")
    func newerTapWins() throws {
        let taps = PushTaps()
        let router = HausRouter()
        router.selectedTab = .tasks
        taps.receive(try #require(HausPush(userInfo: message(kind: "channel"))))
        taps.receive(try #require(HausPush(userInfo: [
            "kind": "issue_comment", "code": "GEN-12", "issueId": "iss_1", "serverId": "srv_a",
        ])))
        taps.mount()
        #expect(taps.route(into: router, activeServerID: "srv_a", memberServerIDs: ["srv_a"]) == .routed)
        #expect(router.selectedTab == .home)
        #expect(router.path(.projects).isEmpty)
    }

    private func message(kind: String) -> [AnyHashable: Any] {
        [
            "chatId": "chat_product",
            "conversation": ["kind": kind, "name": kind == "dm" ? NSNull() : "product"] as [String: Any],
            "conversationChatId": "chat_product",
            "messageId": "msg_1",
            "serverId": "srv_a",
        ]
    }
}
