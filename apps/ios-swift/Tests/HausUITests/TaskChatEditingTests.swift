import Foundation
import HausModels
import Testing
@testable import HausUI

struct TaskChatEditingTests {
    @Test func aTaskWithAChatTakesWritesAndAHistoryTaskDoesNot() {
        #expect(editing(chatID: "chat_task_1").canWrite)
        #expect(!editing(chatID: nil).canWrite)
    }

    private func editing(chatID: String?) -> TaskChatEditing {
        TaskChatEditing(
            task: TaskRecord(
                id: "task_1", shortID: "k3mq7xta", title: "Rotate tokens", chatID: chatID, projectID: "p",
                serverID: "srv", version: 4, createdAt: .distantPast, updatedAt: .distantPast,
                createdBy: .user(userID: "u")
            ),
            isFollowed: false,
            rename: { _ in },
            setArchived: { _ in },
            setFollow: { _ in }
        )
    }
}
