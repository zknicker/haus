import Foundation
import HausModels

/// The Task beside its conversation (specs/ios-app.md, Task mode): whoever
/// started it, its title and activity, and the agent whose turns and files
/// the pane reads.
public struct TaskPanePresentation: Hashable, Sendable {
    public let taskID: String
    public let header: TaskChatHeaderPresentation
    /// The Captain for crew, else the person who started it.
    public let starter: MessageAuthorPresentation?
    /// The Task's own agent. Nil for a Task from before Tasks were agents.
    public let agentID: String?

    public init(taskID: String, header: TaskChatHeaderPresentation, starter: MessageAuthorPresentation?, agentID: String?) {
        self.taskID = taskID
        self.header = header
        self.starter = starter
        self.agentID = agentID
    }
}

/// What the pane shows under its header.
public enum TaskPaneSection: String, CaseIterable, Hashable, Sendable {
    case activity
    case files

    public var title: String {
        switch self {
        case .activity: "Activity"
        case .files: "Files"
        }
    }
}

/// The pane's reads and opens, from the App.
public struct TaskPaneActions: Sendable {
    /// The files the Task's agent wrote, newest first.
    public let loadFiles: @MainActor @Sendable (_ agentID: String) async -> [DriveFilePresentation]?
    public let openFile: @MainActor @Sendable (DriveFilePresentation) -> Void
    public let close: @MainActor @Sendable () -> Void

    public init(
        loadFiles: @escaping @MainActor @Sendable (String) async -> [DriveFilePresentation]?,
        openFile: @escaping @MainActor @Sendable (DriveFilePresentation) -> Void,
        close: @escaping @MainActor @Sendable () -> Void
    ) {
        self.loadFiles = loadFiles
        self.openFile = openFile
        self.close = close
    }
}
