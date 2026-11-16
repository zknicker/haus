import HausModels
import SwiftUI

/// A Task's properties as native settings rows: a short title and its control.
/// Each control writes at once, so there is no Save to forget, and a refused
/// write comes back as a note on the screen.
struct TaskPropertiesSection: View {
    let task: BoardTask
    let columns: [BoardColumn]
    let source: TaskBoardSource
    let onFailure: (String) -> Void

    var body: some View {
        Section {
            Picker("Status", selection: status) {
                ForEach(columns) { column in
                    Label(column.name, systemImage: column.category.symbolName).tag(column.id)
                }
            }
            .pickerStyle(.menu)

            Picker("Assignee", selection: assignee) {
                Text("Unassigned").tag(TaskActor?.none)
                ForEach(source.assignees()) { option in
                    Text(option.name).tag(TaskActor?.some(option.actor))
                }
            }
            .pickerStyle(.menu)

            Picker("Priority", selection: priority) {
                ForEach(TaskPriority.ordered, id: \.self) { priority in
                    Text(priority.displayName).tag(priority)
                }
            }
            .pickerStyle(.menu)

            labelsRow

            Toggle("Due date", isOn: hasDueDate)
            if task.dueOn != nil {
                DatePicker("Due", selection: dueDate, displayedComponents: .date)
            }
        }
    }

    /// A multi-select in a stock menu: each pick stays a Task write of its own,
    /// the same as every other row here.
    private var labelsRow: some View {
        LabeledContent("Labels") {
            Menu {
                ForEach(source.labels()) { label in
                    Button { toggle(label) } label: {
                        if task.labelIDs.contains(label.id) {
                            Label(label.name, systemImage: "checkmark")
                        } else {
                            Text(label.name)
                        }
                    }
                }
            } label: {
                Text(labelSummary)
                    .lineLimit(1)
            }
        }
    }

    /// One line whatever the Task carries: a value that wraps or truncates in
    /// a settings row reads as broken.
    private var labelSummary: String {
        let names = source.labels().filter { task.labelIDs.contains($0.id) }.map(\.name)
        switch names.count {
        case 0: return "None"
        case 1 where names[0].count <= 20: return names[0]
        case 1: return "1 label"
        default: return "\(names.count) labels"
        }
    }

    private var status: Binding<String> {
        Binding(
            get: { task.columnID },
            set: { columnID in write { try await source.moveTask(task, columnID) } }
        )
    }

    private var assignee: Binding<TaskActor?> {
        Binding(
            get: { task.assignee },
            set: { assignee in write { try await source.assignTask(task, assignee) } }
        )
    }

    private var priority: Binding<TaskPriority> {
        Binding(
            get: { task.priority },
            set: { priority in
                write { try await source.updateTask(task, TaskUpdatePatch(priority: priority)) }
            }
        )
    }

    private var hasDueDate: Binding<Bool> {
        Binding(
            get: { task.dueOn != nil },
            set: { isOn in
                let change: TaskDueOnChange = isOn ? .set(TaskDueDate.dueOn(from: .now)) : .cleared
                write { try await source.updateTask(task, TaskUpdatePatch(dueOn: change)) }
            }
        )
    }

    private var dueDate: Binding<Date> {
        Binding(
            get: { task.dueOn.flatMap { TaskDueDate.date($0) } ?? .now },
            set: { date in
                let change = TaskDueOnChange.set(TaskDueDate.dueOn(from: date))
                write { try await source.updateTask(task, TaskUpdatePatch(dueOn: change)) }
            }
        )
    }

    private func toggle(_ label: TaskLabel) {
        let labelIDs = task.labelIDs.contains(label.id)
            ? task.labelIDs.filter { $0 != label.id }
            : task.labelIDs + [label.id]
        write { try await source.updateTask(task, TaskUpdatePatch(labelIDs: labelIDs)) }
    }

    private func write(_ operation: @escaping @MainActor () async throws -> Void) {
        Task { @MainActor in
            do {
                try await operation()
            } catch {
                onFailure(error.localizedDescription)
            }
        }
    }
}
