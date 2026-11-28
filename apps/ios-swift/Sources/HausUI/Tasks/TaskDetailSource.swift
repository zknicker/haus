import Foundation
import HausModels

public struct TaskDetailSource: Sendable {
    public let detail: @MainActor @Sendable (_ taskID: String) -> TaskDetail?
    public let actor: @MainActor @Sendable (TaskActor) -> MessageAuthorPresentation?
    public let conversationLabel: @MainActor @Sendable (_ chatID: String) -> String
    public let descriptionBlocks: @MainActor @Sendable (TaskDetail) -> [RichMessageBlock]

    public let loadDetail: @MainActor @Sendable (_ taskID: String) async throws -> Void

    public init(
        detail: @escaping @MainActor @Sendable (String) -> TaskDetail?,
        actor: @escaping @MainActor @Sendable (TaskActor) -> MessageAuthorPresentation?,
        conversationLabel: @escaping @MainActor @Sendable (String) -> String,
        descriptionBlocks: @escaping @MainActor @Sendable (TaskDetail) -> [RichMessageBlock],
        loadDetail: @escaping @MainActor @Sendable (String) async throws -> Void
    ) {
        self.detail = detail
        self.actor = actor
        self.conversationLabel = conversationLabel
        self.descriptionBlocks = descriptionBlocks
        self.loadDetail = loadDetail
    }
}

extension TaskDetailSource {
    static let preview = TaskDetailSource(
        detail: { _ in TaskPreviewFixtures.detail },
        actor: { actor in
            actor.agentID.map { MessageAuthorPresentation(id: $0, name: "Forge", avatarURL: nil, kind: .captain) }
        },
        conversationLabel: { _ in "#security" },
        descriptionBlocks: { detail in
            RichMessageBlockParser.blocks(detail.descriptionContent) { _, _, _ in nil }
        },
        loadDetail: { _ in }
    )
}
