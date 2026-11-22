import Foundation
import HausAppModel
import HausModels
import HausUI

/// A place's work as the Work pill and the Work view read it: its Workers
/// from `worker.listForChat`, the pull requests its Tasks and Workers read,
/// and the newest files in its Drive folder.
extension HausStore {
    /// The Chat whose Worker list holds a place's Workers. A Chat's list also
    /// carries the Workers of the Task chats started from it.
    func workChatID(_ place: HausWorkPlace) -> String? {
        switch place {
        case .chat(let chatID): chatID
        case .task(let taskID): taskChatID(taskID: taskID)
        }
    }

    /// Everything the place's Work view lists; nil until its Workers are known.
    func workContent(_ place: HausWorkPlace, now: Date) -> WorkViewContent? {
        guard let records = workWorkers(place) else { return nil }
        let items = records.map {
            WorkWorkerItem(worker: WorkerPresentation(work: $0), taskKey: $0.taskId.flatMap(taskKey(taskID:)))
        }
        let pullRequests = PullRequestCatalog.presentations(
            tasks: workTasks(place),
            workers: items.map(\.worker),
            captains: pullRequestAuthors,
            now: now
        )
        let files = workFolder(place).flatMap { drive.recentByFolder[$0] } ?? []
        return WorkViewContent(workers: items, pullRequests: pullRequests, files: files.map(driveFilePresentation))
    }

    func workPill(_ place: HausWorkPlace, now: Date) -> WorkPillState? {
        workContent(place, now: now).map { WorkPillState(content: $0, now: now) }
    }

    /// Reads what a place's pill needs, and its files when the Work view is open.
    func loadWork(_ place: HausWorkPlace, includingFiles: Bool) async {
        await withTaskGroup(of: Void.self) { group in
            if let chatID = workChatID(place) {
                group.addTask { try? await self.workers.loadChat(chatID: chatID) }
            }
            if includingFiles {
                group.addTask { await self.loadWorkFiles(place) }
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
            guard let agentID = chatsByID[chatID]?.peerAgentID, let agent = agentsByID[agentID] else { return nil }
            return DriveArea.agent(handle: agent.handle).path + "/"
        case .task(let taskID):
            guard let projectID = tasks.detailsByID[taskID]?.task.projectID,
                  let project = tasks.projects?.first(where: { $0.id == projectID })
            else { return nil }
            return DriveArea.project(key: project.key.rawValue).path + "/"
        }
    }

    /// The Chats whose Work lists carry the Workers of these Task chats.
    func workParentChatIDs(taskChatIDs: Set<String>) -> Set<String> {
        Set(tasks.detailsByID.values.compactMap { detail in
            detail.task.chatID.map(taskChatIDs.contains) == true ? detail.task.origin?.chatID : nil
        })
    }

    func taskKey(taskID: String) -> String? {
        tasks.detailsByID[taskID]?.task.key ?? transcripts.taskPreview(taskID: taskID)?.key
    }

    func driveFilePresentation(_ record: ArtifactRecord) -> DriveFilePresentation {
        DriveFilePresentation(record: record, authorName: artifactAuthorName(record.author))
    }

    var pullRequestAuthors: [String: PullRequestAuthor] {
        agentsByID.mapValues { PullRequestAuthor(captainName: $0.displayName) }
    }

    private func workWorkers(_ place: HausWorkPlace) -> [Worker]? {
        if let chatID = workChatID(place), let rows = workers.byChatID[chatID] {
            var seen = Set<String>()
            return rows.map(\.worker)
                .filter { seen.insert($0.id).inserted }
                .sorted { $0.updatedAt > $1.updatedAt }
        }
        if case .task(let taskID) = place, let detail = tasks.detailsByID[taskID] {
            return detail.attachedWork
        }
        return nil
    }

    private func workTasks(_ place: HausWorkPlace) -> [TaskDetail] {
        switch place {
        case .chat(let chatID):
            tasks.detailsByID.values
                .filter { $0.task.origin?.chatID == chatID }
                .sorted { $0.task.updatedAt > $1.task.updatedAt }
        case .task(let taskID):
            tasks.detailsByID[taskID].map { [$0] } ?? []
        }
    }

    private func artifactAuthorName(_ author: ArtifactAuthor) -> String? {
        switch author {
        case .agent(let id), .worker(_, let id): agentsByID[id]?.displayName
        case .user(let id): membersByID[id].flatMap { $0.displayName ?? $0.handle }
        case .haus: "Haus"
        }
    }
}
