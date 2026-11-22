import HausModels
import SwiftUI

/// The Task chat's `…` menu: assignee, priority, labels, due date, follow, and
/// the jump to where the Task started. Each pick hands its write to `run`,
/// which reports a refusal.
struct TaskChatMenu: View {
    let editing: TaskChatEditing?
    /// Where the Task started, such as "#product", or nil when it is not known.
    let originLabel: String?
    let onOpenOrigin: () -> Void
    let onEditDue: () -> Void
    let run: (@escaping () async throws -> Void) -> Void

    var body: some View {
        Menu("Task options", systemImage: "ellipsis") {
            if let editing {
                assigneeMenu(editing)
                priorityMenu(editing)
                labelsMenu(editing)
                Button(dueTitle(editing.task), systemImage: "calendar", action: onEditDue)
                Button(
                    editing.isFollowed ? "Unfollow" : "Follow",
                    systemImage: editing.isFollowed ? "bell.slash" : "bell"
                ) {
                    run { try await editing.setFollow(!editing.isFollowed) }
                }
            }
            if let originLabel {
                Section {
                    Button("Open \(originLabel)", systemImage: "arrow.turn.left.up", action: onOpenOrigin)
                }
            }
        }
    }

    private func assigneeMenu(_ editing: TaskChatEditing) -> some View {
        Menu {
            Button {
                run { try await editing.assign(nil) }
            } label: {
                checked("Unassigned", editing.task.assignee == nil)
            }
            Section("Captains") { people(editing.captains, in: editing) }
            Section("People") { people(editing.people, in: editing) }
        } label: {
            Label(editing.assignee?.name ?? "Assign", systemImage: "person.crop.circle")
        }
    }

    private func people(_ options: [TaskPersonOption], in editing: TaskChatEditing) -> some View {
        ForEach(options) { person in
            Button {
                run { try await editing.assign(person.actor) }
            } label: {
                checked(person.name, editing.task.assignee == person.actor)
            }
        }
    }

    private func priorityMenu(_ editing: TaskChatEditing) -> some View {
        Menu {
            ForEach(TaskPriority.pickerOrder, id: \.self) { priority in
                Button {
                    run { try await editing.update(TaskEditPatch.priority(priority)) }
                } label: {
                    checked(priority.displayName, editing.task.priority == priority)
                }
            }
        } label: {
            Label(editing.task.priority == .none ? "Priority" : editing.task.priority.displayName,
                  systemImage: "chart.bar")
        }
    }

    @ViewBuilder
    private func labelsMenu(_ editing: TaskChatEditing) -> some View {
        if let labels = editing.labels, !labels.isEmpty {
            Menu {
                ForEach(labels) { label in
                    Button {
                        run { try await editing.update(TaskEditPatch.toggling(label: label.id, on: editing.task)) }
                    } label: {
                        checked(label.name, editing.task.labelIDs.contains(label.id))
                    }
                }
            } label: {
                Label(labelsTitle(editing, labels: labels), systemImage: "tag")
            }
        }
    }

    @ViewBuilder
    private func checked(_ title: String, _ isOn: Bool) -> some View {
        if isOn {
            Label(title, systemImage: "checkmark")
        } else {
            Text(title)
        }
    }

    private func labelsTitle(_ editing: TaskChatEditing, labels: [TaskLabel]) -> String {
        let names = labels.filter { editing.task.labelIDs.contains($0.id) }.map(\.name)
        return names.isEmpty ? "Labels" : names.joined(separator: ", ")
    }

    private func dueTitle(_ task: TaskRecord) -> String {
        task.dueOn.flatMap { TaskDueDate.label($0) }.map { "Due \($0)" } ?? "Due date"
    }
}

/// The due-date sheet: a calendar, Clear, and Save.
struct TaskDueDateSheet: View {
    let dueOn: String?
    let onSave: (Date?) async throws -> Void

    @State private var date = Date.now
    @State private var isSaving = false
    @State private var failure: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                DatePicker("Due", selection: $date, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                if dueOn != nil {
                    Button("Clear due date", role: .destructive) { save(nil) }
                }
                if let failure {
                    Text(failure).foregroundStyle(HausPlatformColor.critical)
                }
            }
            .navigationTitle("Due date")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", systemImage: "xmark", role: .cancel) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save", systemImage: "checkmark", role: .confirm) { save(date) }
                        .disabled(isSaving)
                }
            }
        }
        .presentationDetents([.large])
        .onAppear {
            if let dueOn, let due = TaskDueDate.date(dueOn) { date = due }
        }
    }

    private func save(_ date: Date?) {
        isSaving = true
        failure = nil
        Task {
            do {
                try await onSave(date)
                dismiss()
            } catch {
                failure = error.localizedDescription
            }
            isSaving = false
        }
    }
}
