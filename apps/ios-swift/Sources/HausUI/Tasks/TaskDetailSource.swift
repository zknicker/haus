import Foundation
import HausModels

public struct TaskDetailSource: Sendable {
    public let detail: @MainActor @Sendable (_ taskID: String) -> TaskDetail?
    public let labels: @MainActor @Sendable () -> [TaskLabel]
    public let actor: @MainActor @Sendable (TaskActor) -> MessageAuthorPresentation?
    public let conversationLabel: @MainActor @Sendable (_ chatID: String) -> String
    public let descriptionBlocks: @MainActor @Sendable (TaskDetail) -> [RichMessageBlock]

    public let loadDetail: @MainActor @Sendable (_ taskID: String) async throws -> Void
    public let loadLabels: @MainActor @Sendable () async throws -> Void

    public init(
        detail: @escaping @MainActor @Sendable (String) -> TaskDetail?,
        labels: @escaping @MainActor @Sendable () -> [TaskLabel],
        actor: @escaping @MainActor @Sendable (TaskActor) -> MessageAuthorPresentation?,
        conversationLabel: @escaping @MainActor @Sendable (String) -> String,
        descriptionBlocks: @escaping @MainActor @Sendable (TaskDetail) -> [RichMessageBlock],
        loadDetail: @escaping @MainActor @Sendable (String) async throws -> Void,
        loadLabels: @escaping @MainActor @Sendable () async throws -> Void
    ) {
        self.detail = detail
        self.labels = labels
        self.actor = actor
        self.conversationLabel = conversationLabel
        self.descriptionBlocks = descriptionBlocks
        self.loadDetail = loadDetail
        self.loadLabels = loadLabels
    }
}

extension TaskDetailSource {
    static let preview = TaskDetailSource(
        detail: { _ in TaskPreviewFixtures.detail },
        labels: { TaskPreviewFixtures.labels },
        actor: { actor in
            actor.agentID.map { MessageAuthorPresentation(id: $0, name: "Forge", avatarURL: nil) }
        },
        conversationLabel: { _ in "#security" },
        descriptionBlocks: { detail in
            TaskLinkChips.apply(
                detail.descriptionTaskLinks,
                to: RichMessageBlockParser.blocks(detail.descriptionContent) { _, _, _ in nil }
            )
        },
        loadDetail: { _ in },
        loadLabels: {}
    )
}
