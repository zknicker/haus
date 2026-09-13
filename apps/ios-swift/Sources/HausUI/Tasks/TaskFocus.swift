import Foundation
import HausModels

/// One task the Task list is asked to land on.
///
/// A Task is a promoted Message, so the Message id is the whole focus — the
/// same id `TaskListItem.id` carries and the same one the App deep link spends
/// on `?task=`. It rides the route rather than screen state, because what a row
/// press opens is the route's to say.
public struct TaskFocus: Hashable, Sendable, Identifiable {
    public let messageID: String

    public var id: String { messageID }

    public init(messageID: String) {
        self.messageID = messageID
    }
}

/// Whether a focused task forces the widened lens open.
///
/// The default lens hides the background tier, so a focused task the lens does
/// not hold is a task the reader was sent to and cannot see. Widening is the
/// only way to honor the route, and the reader can close it again through the
/// same control they always could.
///
/// It stays shut while the lens is still loading: nil is "not known yet", not
/// "absent", and widening on a snapshot that has not landed would reload the
/// screen a second time for nothing.
public enum TaskFocusLens {
    public static func widens(focus: TaskFocus?, defaultLens: [TaskListItem]?) -> Bool {
        guard let focus, let defaultLens else { return false }
        return !defaultLens.contains { $0.id == focus.messageID }
    }
}
