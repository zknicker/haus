import HausModels
import SwiftUI

/// The Task chat's stock centered header: the state disc and the title, which
/// open the Status sheet, and the `…` menu.
extension TaskChatView {
    func chrome(_ content: some View) -> some View {
        content
            .navigationTitle(header?.title ?? "")
            .hausInlineNavigationTitle()
            .toolbar { taskToolbar }
            .sheet(isPresented: $isStatusPresented) { statusSheet }
            .sheet(isPresented: $isDuePresented) { dueSheet }
            .alert("Couldn’t change the Task", isPresented: editFailurePresented) {
                Button("OK", role: .cancel) { editFailure = nil }
            } message: {
                Text(editFailure ?? "")
            }
    }

    @ToolbarContentBuilder
    var taskToolbar: some ToolbarContent {
        ToolbarItem(placement: .principal) {
            if let header {
                TaskChatTitle(
                    header: header,
                    subtitle: showsOutage ? ConnectionOutage.title : nil,
                    canEditState: editing != nil
                ) {
                    isStatusPresented = true
                }
            }
        }
        if editing != nil || startedFrom != nil {
            ToolbarItem(placement: .primaryAction) {
                TaskChatMenu(
                editing: editing,
                originLabel: startedFrom?.placeLabel,
                onOpenOrigin: onOpenOrigin,
                onEditDue: { isDuePresented = true },
                    run: runEdit
                )
            }
        }
    }

    @ViewBuilder
    var statusSheet: some View {
        if let editing {
            TaskStatusSheet(current: editing.task.state, onPick: editing.setState)
        }
    }

    @ViewBuilder
    var dueSheet: some View {
        if let editing {
            TaskDueDateSheet(dueOn: editing.task.dueOn) { date in
                try await editing.update(TaskEditPatch.due(date))
            }
        }
    }

    var editFailurePresented: Binding<Bool> {
        Binding(get: { editFailure != nil }, set: { if !$0 { editFailure = nil } })
    }

    func runEdit(_ write: @escaping () async throws -> Void) {
        Task {
            do {
                try await write()
            } catch {
                editFailure = error.localizedDescription
            }
        }
    }
}

/// The centered identity: the state disc and the truncating title, with the
/// connection state under them while the link is down.
struct TaskChatTitle: View {
    let header: TaskChatHeaderPresentation
    let subtitle: String?
    let canEditState: Bool
    let onEditState: () -> Void

    var body: some View {
        Group {
            if canEditState {
                Button(action: onEditState) { label }
                    .buttonStyle(.plain)
                    .accessibilityHint("Changes the status")
            } else {
                label
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(header.key), \(header.title)")
        .accessibilityValue(header.stateLabel)
        .accessibilityAddTraits(.isHeader)
    }

    private var label: some View {
        VStack(spacing: 1) {
            HStack(spacing: 7) {
                TaskStateDisc(state: header.state, size: 16, surface: HausPlatformColor.canvas)
                Text(header.title)
                    .font(HausFont.font(size: 17, weight: .medium))
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            if let subtitle {
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(HausPlatformColor.mutedInk)
            }
        }
        .contentShape(.rect)
    }
}
