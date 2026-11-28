import Foundation
import HausAppModel
import HausModels
import HausUI

/// A place's work as the Work pill and the Work view read it: the pull
/// requests its Tasks read, and the newest files in its Drive folder.
extension HausStore {
    /// Everything the place's Work view lists; nil until its Tasks are known.
    func workContent(_ place: HausWorkPlace) -> WorkViewContent? {
        guard let details = workTasks(place) else { return nil }
        let pullRequests = PullRequestCatalog.presentations(tasks: details, captains: pullRequestAuthors)
        let files = workFolder(place).flatMap { drive.recentByFolder[$0] } ?? []
        return WorkViewContent(pullRequests: pullRequests, files: files.map(driveFilePresentation))
    }

    func workPill(_ place: HausWorkPlace) -> WorkPillState? {
        workContent(place).map(WorkPillState.init(content:))
    }

    /// Reads what a place's pill needs and, when the Work view is open, its files.
    func loadWork(_ place: HausWorkPlace, includingFiles: Bool) async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.loadWorkTasks(place) }
            if includingFiles {
                group.addTask { await self.loadWorkFiles(place) }
            }
        }
    }

    /// A Task's own detail, or the details of a Chat's Tasks not held yet, one
    /// at a time: their pull request readings are what the place lists.
    private func loadWorkTasks(_ place: HausWorkPlace) async {
        switch place {
        case .task(let taskID):
            try? await tasks.reloadDetail(taskID: taskID)
        case .chat(let chatID):
            if tasks.activeTasks == nil { await tasks.refreshActiveTasks() }
            let taskIDs = (tasks.activeTasks ?? []).filter { belongs($0, to: chatID) }.map(\.id)
            for taskID in taskIDs.sorted() where tasks.detailsByID[taskID] == nil {
                try? await tasks.reloadDetail(taskID: taskID)
            }
        }
    }

    private func loadWorkFiles(_ place: HausWorkPlace) async {
        if tasks.projects == nil { try? await tasks.reloadProjects() }
        guard let folder = workFolder(place) else { return }
        try? await drive.loadRecent(folder: folder)
    }

    /// The Drive folder a place's files live in: a Project's or a Captain's.
    func workFolder(_ place: HausWorkPlace) -> String? {
        switch place {
        case .chat(let chatID):
            if let project = tasks.projects?.first(where: { $0.chatID == chatID }) {
                return DriveArea.project(key: project.key.rawValue).path + "/"
            }
            guard let agentID = chatsByID[chatID]?.captainID, let agent = agentsByID[agentID] else { return nil }
            return DriveArea.agent(handle: agent.handle).path + "/"
        case .task(let taskID):
            guard let projectID = tasks.record(taskID: taskID)?.projectID,
                  let project = tasks.projects?.first(where: { $0.id == projectID })
            else { return nil }
            return DriveArea.project(key: project.key.rawValue).path + "/"
        }
    }

    func driveFilePresentation(_ record: ArtifactRecord) -> DriveFilePresentation {
        DriveFilePresentation(record: record, authorName: artifactAuthorName(record.author))
    }

    var pullRequestAuthors: [String: PullRequestAuthor] {
        agentsByID.mapValues { PullRequestAuthor(captain: captainIdentity($0)) }
    }

    /// The details whose pull requests a place lists: a Task's own, or a
    /// Chat's Tasks, the ones started from it or, in a Captain chat, its crew.
    private func workTasks(_ place: HausWorkPlace) -> [TaskDetail]? {
        switch place {
        case .task(let taskID):
            return tasks.detailsByID[taskID].map { [$0] }
        case .chat(let chatID):
            guard tasks.activeTasks != nil else { return nil }
            return tasks.detailsByID.values
                .filter { belongs($0.task, to: chatID) }
                .sorted { $0.task.updatedAt > $1.task.updatedAt }
        }
    }

    private func belongs(_ task: TaskRecord, to chatID: String) -> Bool {
        if task.origin?.chatID == chatID { return true }
        guard let captainID = chatsByID[chatID]?.captainID else { return false }
        return task.captainID == captainID
    }

    private func artifactAuthorName(_ author: ArtifactAuthor) -> String? {
        switch author {
        case .agent(let id): agentsByID[id]?.displayName
        case .user(let id): membersByID[id].flatMap { $0.displayName ?? $0.handle }
        case .haus: "Haus"
        }
    }
}
