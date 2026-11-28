import Foundation
import HausModels
import Testing
@testable import HausUI

struct ListRailsTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let piper = CaptainIdentity(id: "agent_piper", name: "Piper", avatarURL: nil)
    private let juniper = CaptainIdentity(id: "agent_juniper", name: "Juniper", avatarURL: nil)

    @Test func homeListsRecentConversationsWithUnreadAndWorkDotsAndMarksTheSelection() {
        let rows = [
            homeRow("chat_ops", lead: .project(.default), target: .chat("chat_ops")),
            homeRow("chat_piper", lead: .captain(piper), isUnread: true, target: .captain(piper.id)),
            homeRow("chat_juniper", lead: .captain(juniper), target: .captain(juniper.id)),
            homeRow("chat_task", lead: .task(.active(.working)), target: .task("task_1")),
            homeRow("chat_dm", lead: .person(name: "Mia", avatarURL: nil), target: .chat("chat_dm")),
        ]

        let items = ListRails.home(rows, workingCaptainIDs: [piper.id, juniper.id], selected: .chat("chat_ops"))

        #expect(items.map(\.target) == rows.map(\.target))
        #expect(items.map(\.badge) == [nil, .unread, .working, .working, nil])
        #expect(items.map(\.isSelected) == [true, false, false, false, false])
        #expect(items[0].mark == .project(.default))
        #expect(items[1].mark == .captain(piper))
        #expect(items[1].label == "chat_piper")
    }

    @Test func homeMarksNothingWhenTheDetailShowsAConversationOffTheRail() {
        let rows = [homeRow("chat_ops", lead: .project(.default), target: .chat("chat_ops"))]

        #expect(ListRails.home(rows, workingCaptainIDs: [], selected: .captain("agent_other")).allSatisfy { !$0.isSelected })
        #expect(ListRails.home(rows, workingCaptainIDs: [], selected: nil).allSatisfy { !$0.isSelected })
    }

    @Test func projectsListTheirTilesWithAllLastAndUnreadDots() {
        let rows = [
            projectRow("chat_all", isAll: true),
            projectRow("chat_ops", isUnread: true),
            projectRow("chat_security"),
        ]

        let items = ListRails.projects(rows, selectedChatID: "chat_security")

        #expect(items.map(\.target) == ["chat_ops", "chat_security", "chat_all"])
        #expect(items.map(\.badge) == [.unread, nil, nil])
        #expect(items.map(\.isSelected) == [false, true, false])
        #expect(items.allSatisfy { if case .project = $0.mark { true } else { false } })
    }

    @Test func tasksListTheViewsTasksInActivityOrderAsTheirDiscs() {
        let content = TaskListContent(
            tasks: [task("idle", activity: .idle), task("working", activity: .working), task("needs", needsYou: true)],
            viewerUserID: "user_me",
            unreadTaskIDs: ["idle"]
        )

        let items = ListRails.tasks(content, view: .all, selectedTaskID: "working")

        #expect(items.map(\.target) == ["needs", "working", "idle"])
        #expect(items.map(\.mark) == [.task(.active(.needsYou)), .task(.active(.working)), .task(.active(.idle))])
        #expect(items.map(\.badge) == [nil, nil, .unread])
        #expect(items.map(\.isSelected) == [false, true, false])
    }

    @Test func tasksRailIsEmptyUntilTheListLoads() {
        let content = TaskListContent(tasks: nil, viewerUserID: "user_me")

        #expect(ListRails.tasks(content, view: .mine, selectedTaskID: nil).isEmpty)
    }

    @Test func youListsTheSettingsRowsThatSelectAScreenWithTheSelectionMarked() {
        let items = ListRails.you(SettingsFixtures.data, selected: .drive(prefix: ""))

        #expect(items.map(\.target) == [
            .profile, .automations, .drive(prefix: ""), .general, .notifications,
            .captains, .models, .projects, .computers, .people, .server, .appInfo,
        ])
        #expect(items.filter(\.isSelected).map(\.target) == [.drive(prefix: "")])
        #expect(items[0].mark == .person(name: "Zach Knickerbocker", avatarURL: nil))
        #expect(items[3].mark == .icon(.settings))
    }

    @Test func youLeavesAutomationsOutForSomeoneWhoCannotManageTheServer() {
        let member = SettingsData(
            server: SettingsServer(id: "srv", name: "Haus", slug: "haus", role: "Member", memberCount: 1, agentCount: 0),
            viewer: SettingsFixtures.viewer,
            agents: []
        )

        #expect(!ListRails.you(member, selected: nil).map(\.target).contains(.automations))
    }

    private func homeRow(
        _ id: String,
        lead: HomeRowLead,
        isUnread: Bool = false,
        target: HomeRowTarget
    ) -> HomeRowPresentation {
        HomeRowPresentation(id: id, lead: lead, title: id, subtitle: "", time: now, isUnread: isUnread, target: target)
    }

    private func projectRow(_ chatID: String, isAll: Bool = false, isUnread: Bool = false) -> ProjectRowPresentation {
        ProjectRowPresentation(
            chatID: chatID,
            name: chatID,
            appearance: .default,
            isAll: isAll,
            captains: [],
            openTaskCount: nil,
            lastActivityAt: now,
            isUnread: isUnread,
            projectID: nil
        )
    }

    private func task(_ id: String, activity: TaskActivity = .idle, needsYou: Bool = false) -> TaskRecord {
        TaskRecord(
            id: id,
            shortID: "k3mq7xta",
            title: id,
            activity: activity,
            needsYou: needsYou,
            archivedAt: nil,
            computerID: "cmp_1",
            model: "gpt-5",
            projectID: "chat_product",
            serverID: "srv",
            version: 1,
            createdAt: now,
            updatedAt: now,
            createdBy: .user(userID: "user_me")
        )
    }
}
