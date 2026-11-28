import Foundation
import HausAppModel
import HausModels
import HausUI

/// The Search tab's local lists: Captains, the other members, and the Tasks
/// the Server's Task lists already authorized for the viewer.
extension HausStore {
    var searchPaletteContent: SearchPaletteContent {
        let captains = agents.map { agent in
            SearchCaptain(
                id: agent.id,
                name: agent.displayName,
                avatarURL: resolvedAvatarURL(agent.avatarURL),
                isWorking: availability(for: agent) == .working
            )
        }
        let captainsByID = Dictionary(captains.map { ($0.id, $0) }, uniquingKeysWith: { first, _ in first })
        return SearchPaletteContent(
            captains: captains,
            people: searchPeople,
            tasks: searchTasks(captainsByID: captainsByID)
        )
    }

    /// `task.listActive`, which the palette's Recent and Tasks scope read.
    func loadSearchPalette() async {
        await tasks.refreshActiveTasks()
    }

    private var searchPeople: [SearchPerson] {
        guard let directory = members else { return [] }
        return directory.members
            .filter { $0.userID != directory.viewerUserID }
            .map(searchPerson)
    }

    private func searchTasks(captainsByID: [String: SearchCaptain]) -> [SearchTask]? {
        guard tasks.activeTasks != nil || tasks.list != nil else { return nil }
        let peopleByID = Dictionary(
            (members?.members ?? []).map { member in
                (member.userID, searchPerson(member))
            },
            uniquingKeysWith: { first, _ in first }
        )
        return tasks.heldRecords.map { record in
            SearchTask(
                id: record.id,
                shortID: record.shortID,
                title: record.title,
                disc: TaskDiscState(record),
                captain: record.captainID.flatMap { captainsByID[$0] },
                person: record.createdBy.userID.flatMap { peopleByID[$0] },
                updatedAt: record.updatedAt
            )
        }
    }

    private func searchPerson(_ member: MemberSummary) -> SearchPerson {
        SearchPerson(
            id: member.userID,
            name: member.displayName ?? member.handle ?? member.email ?? "Haus member",
            handle: member.handle,
            avatarURL: resolvedAvatarURL(member.avatarURL)
        )
    }
}
