import HausModels
import SwiftUI

/// The detail column's bar while a Task sits beside its conversation
/// (specs/ios-app.md, Task mode): the Task's More menu takes the place of the
/// conversation's own items. There is no Stop, as on the web App.
public struct TaskModeChromePresentation {
    public let editing: TaskChatEditing?
    public let originLabel: String?
    public let onOpenOrigin: () -> Void

    public init(editing: TaskChatEditing?, originLabel: String?, onOpenOrigin: @escaping () -> Void) {
        self.editing = editing
        self.originLabel = originLabel
        self.onOpenOrigin = onOpenOrigin
    }
}

extension View {
    /// The conversation under a Task: its bar shows the Task's controls.
    public func taskModeChrome(_ chrome: TaskModeChromePresentation?) -> some View {
        modifier(TaskModeChrome(chrome: chrome))
    }
}

private struct TaskModeChrome: ViewModifier {
    let chrome: TaskModeChromePresentation?

    @State private var isRenamePresented = false
    @State private var renameDraft = ""
    @State private var editFailure: String?

    func body(content: Content) -> some View {
        content
            .environment(\.chatHeaderYieldsToolbar, chrome != nil)
            .toolbar {
                if let chrome {
                    ToolbarItem(placement: .primaryAction) {
                        TaskChatMenu(
                            editing: chrome.editing,
                            originLabel: chrome.originLabel,
                            onOpenOrigin: chrome.onOpenOrigin,
                            onRename: {
                                renameDraft = chrome.editing?.task.title ?? ""
                                isRenamePresented = true
                            },
                            run: run
                        )
                    }
                }
            }
            .alert("Rename task", isPresented: $isRenamePresented) {
                TextField("Title", text: $renameDraft)
                Button("Cancel", role: .cancel) {}
                Button("Rename", action: rename)
            }
            .alert("Couldn’t change the Task", isPresented: failurePresented) {
                Button("OK", role: .cancel) { editFailure = nil }
            } message: {
                Text(editFailure ?? "")
            }
    }

    private var failurePresented: Binding<Bool> {
        Binding(get: { editFailure != nil }, set: { if !$0 { editFailure = nil } })
    }

    private func rename() {
        guard let editing = chrome?.editing else { return }
        let title = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title != editing.task.title else { return }
        run { try await editing.rename(title) }
    }

    private func run(_ write: @escaping () async throws -> Void) {
        Task {
            do {
                try await write()
            } catch {
                editFailure = error.localizedDescription
            }
        }
    }
}

extension EnvironmentValues {
    /// True on a conversation with a Task beside it, whose header leaves the
    /// bar to the Task's controls.
    @Entry public var chatHeaderYieldsToolbar = false
}
