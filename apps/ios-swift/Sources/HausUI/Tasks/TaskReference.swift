import Foundation
import HausModels

/// How a Task is named when copied: the web App's `taskReferenceMarkdown`, a
/// `[title](task://id)` link that pastes into any message as a chip.
public enum TaskReference {
    public static func markdown(_ task: TaskRecord) -> String {
        let label = task.title.replacing(/[\\\[\]]/) { "\\\($0.output)" }
        let target = TaskReferenceTarget(taskID: task.id).url?.absoluteString ?? "task://\(task.id)"
        return "[\(label)](\(target))"
    }
}
