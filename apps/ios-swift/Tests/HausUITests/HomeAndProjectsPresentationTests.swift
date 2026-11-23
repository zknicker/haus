import Foundation
import HausModels
import Testing
@testable import HausUI

@Suite("Home and Projects presentation")
struct HomeAndProjectsPresentationTests {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    @Test("A Captain keeps its tint across launches")
    func captainTintIsStable() {
        #expect(CaptainTint.index(for: "agent_blippy") == CaptainTint.index(for: "agent_blippy"))
        let indices = Set(["a", "b", "c", "d", "e", "f", "g", "h"].map(CaptainTint.index(for:)))
        #expect(indices.allSatisfy { CaptainTint.palette.indices.contains($0) })
        #expect(indices.count > 1)
    }

    @Test("Stopped and away Captains rest; idle, working, and failed ones do not")
    func restingCaptains() {
        #expect(CaptainTilePresentation.isResting(.stopped))
        #expect(CaptainTilePresentation.isResting(.offline))
        #expect(!CaptainTilePresentation.isResting(.idle))
        #expect(!CaptainTilePresentation.isResting(.working))
        #expect(!CaptainTilePresentation.isResting(.error))
    }

    @Test("A Project row's preview names its author; a DM's does not")
    func previewLine() {
        #expect(HomeRowPresentation.preview("shipping it **today**", author: "Mia") == "Mia: shipping it today")
        #expect(HomeRowPresentation.preview("Mock board is up.", author: nil) == "Mock board is up.")
        #expect(HomeRowPresentation.preview("", author: nil) == "Attachment")
    }

    @Test("A Task row puts its age at the end of the meta line; a conversation row trails it")
    func timePlacement() {
        let task = row(time: now.addingTimeInterval(-3_600), placement: .meta, subtitle: "Blippy · HAUS-41")
        #expect(task.meta(now: now) == "Blippy · HAUS-41 · 1h")
        #expect(task.trailingTime(now: now) == nil)

        let chat = row(time: now.addingTimeInterval(-120), placement: .trailing, subtitle: "Opened HAUS-41")
        #expect(chat.meta(now: now) == "Opened HAUS-41")
        #expect(chat.trailingTime(now: now) == "2m")
    }

    @Test("Mark read is offered only on an unread row")
    func markReadNeedsUnread() {
        #expect(row(isUnread: false).markReadChatID == nil)
        #expect(row(isUnread: true).markReadChatID == "chat_1")
    }

    @Test("A Project counts its open Tasks once known, and #all says who is in it")
    func projectMeta() {
        #expect(project("a", openTaskCount: nil).meta == nil)
        #expect(project("a", openTaskCount: 0).meta == "No open tasks")
        #expect(project("a", openTaskCount: 1).meta == "1 open task")
        #expect(project("a", openTaskCount: 4).meta == "4 open tasks")
        #expect(project("all", isAll: true, openTaskCount: 3).meta == "Everyone on this Server")
    }

    @Test("Unread narrows to unread Projects, a Captain to its Projects, and #all stays last")
    func projectsFilter() {
        let blippy = CaptainIdentity(id: "blippy", name: "Blippy", avatarURL: nil)
        let rows = [
            project("all", isAll: true),
            project("haus", captains: [blippy], isUnread: true),
            project("merch"),
        ]

        #expect(ProjectsFilter().apply(rows).map(\.chatID) == ["haus", "merch", "all"])
        #expect(ProjectsFilter(scope: .unread).apply(rows).map(\.chatID) == ["haus"])
        #expect(ProjectsFilter(captainID: "blippy").apply(rows).map(\.chatID) == ["haus", "all"])
        #expect(!ProjectsFilter().isNarrowed)
        #expect(ProjectsFilter(captainID: "blippy").isNarrowed)
    }

    @Test("A repo names the Devices it is checked out on")
    func repoLinksLine() throws {
        let links = try JSONDecoder().decode(
            [ProjectRepoLink].self,
            from: Data(#"[{"checkoutPath":null,"computerId":"c1","computerName":"Studio"},{"checkoutPath":null,"computerId":"c2","computerName":null}]"#.utf8)
        )
        #expect(ProjectReposSection.linksLine(links) == "Studio, A Device")
        #expect(ProjectReposSection.linksLine([]) == "Not on any Device")
    }

    private func row(
        time: Date? = nil,
        placement: HomeRowPresentation.TimePlacement = .trailing,
        subtitle: String = "",
        isUnread: Bool = false
    ) -> HomeRowPresentation {
        HomeRowPresentation(
            id: "row",
            lead: .task(.open),
            title: "Row",
            subtitle: subtitle,
            time: time,
            timePlacement: placement,
            isUnread: isUnread,
            target: .chat("chat_1"),
            markReadChatID: "chat_1"
        )
    }

    private func project(
        _ chatID: String,
        isAll: Bool = false,
        captains: [CaptainIdentity] = [],
        openTaskCount: Int? = nil,
        isUnread: Bool = false
    ) -> ProjectRowPresentation {
        ProjectRowPresentation(
            chatID: chatID,
            name: chatID,
            appearance: .default,
            isAll: isAll,
            captains: captains,
            openTaskCount: openTaskCount,
            lastActivityAt: nil,
            isUnread: isUnread,
            projectID: chatID
        )
    }
}
