import HausModels
import SwiftUI

/// The Status sheet the header's state disc opens: one card of states, the
/// current one checked. Picking another sets it and closes the sheet; a
/// refused write keeps the sheet open and says why.
struct TaskStatusSheet: View {
    let current: TaskState
    let onPick: (TaskTargetState) async throws -> Void

    @State private var pending: TaskStatusChoice?
    @State private var failure: String?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(TaskStatusChoice.allCases, id: \.self) { choice in
                        Button {
                            pick(choice)
                        } label: {
                            row(choice)
                        }
                        .disabled(pending != nil)
                    }
                } footer: {
                    if let failure {
                        Text(failure).foregroundStyle(HausPlatformColor.critical)
                    }
                }
            }
            .modelSheetListStyle()
            .navigationTitle("Status")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", systemImage: "xmark", role: .cancel) { dismiss() }
                }
            }
        }
        .presentationDetents([.medium])
    }

    private func row(_ choice: TaskStatusChoice) -> some View {
        HStack(spacing: 14) {
            TaskStateDisc(state: choice.state, size: 17, surface: HausPlatformColor.card)
            Text(choice.title)
                .foregroundStyle(HausPlatformColor.ink)
            Spacer(minLength: 0)
            if pending == choice {
                ProgressView()
            } else if TaskStatusChoice(current) == choice {
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(HausPlatformColor.accentInk)
                    .accessibilityHidden(true)
            }
        }
        .frame(minHeight: 36)
        .contentShape(.rect)
        .accessibilityAddTraits(TaskStatusChoice(current) == choice ? .isSelected : [])
    }

    private func pick(_ choice: TaskStatusChoice) {
        guard TaskStatusChoice(current) != choice else {
            dismiss()
            return
        }
        pending = choice
        failure = nil
        Task {
            do {
                try await onPick(choice.target)
                dismiss()
            } catch {
                failure = error.localizedDescription
            }
            pending = nil
        }
    }
}
