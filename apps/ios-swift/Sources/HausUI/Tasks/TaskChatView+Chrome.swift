import HausModels
import SwiftUI

/// The Task chat's header: the activity disc and the title over its
/// activity, and the `…` menu. The identity is centered with custom chrome
/// and leads the column under stock bars, as a Chat's does.
extension TaskChatView {
    func chrome(_ content: some View) -> some View {
        content
            .navigationTitle(shellChrome == .stock ? "" : header?.title ?? "")
            .hausInlineNavigationTitle()
            .toolbar { taskToolbar }
            .alert("Rename task", isPresented: $isRenamePresented) {
                TextField("Title", text: $renameDraft)
                Button("Cancel", role: .cancel) {}
                Button("Rename") { rename() }
            }
            .alert("Couldn’t change the Task", isPresented: editFailurePresented) {
                Button("OK", role: .cancel) { editFailure = nil }
            } message: {
                Text(editFailure ?? "")
            }
    }

    @ToolbarContentBuilder
    var taskToolbar: some ToolbarContent {
        ToolbarItem(placement: titlePlacement) {
            if let header {
                TaskChatTitle(
                    header: header,
                    subtitle: showsOutage ? ConnectionOutage.title : nil,
                    alignment: shellChrome == .stock ? .leading : .center
                )
            }
        }
        .sharedBackgroundVisibility(shellChrome == .stock ? .hidden : .automatic)
        if editing != nil || startedFrom != nil {
            ToolbarItem(placement: .primaryAction) {
                TaskChatMenu(
                    editing: editing,
                    originLabel: startedFrom?.placeLabel,
                    onOpenOrigin: onOpenOrigin,
                    onRename: {
                        renameDraft = editing?.task.title ?? ""
                        isRenamePresented = true
                    },
                    run: runEdit
                )
                .hausHeaderGlyph()
            }
        }
    }

    private var titlePlacement: ToolbarItemPlacement {
        #if os(iOS)
        shellChrome == .stock ? .topBarLeading : .principal
        #else
        .principal
        #endif
    }

    var editFailurePresented: Binding<Bool> {
        Binding(get: { editFailure != nil }, set: { if !$0 { editFailure = nil } })
    }

    func rename() {
        guard let editing else { return }
        let title = renameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty, title != editing.task.title else { return }
        runEdit { try await editing.rename(title) }
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

/// The identity: the activity disc and the truncating title over the
/// activity, or the connection state while the link is down.
struct TaskChatTitle: View {
    let header: TaskChatHeaderPresentation
    let subtitle: String?
    var alignment: HorizontalAlignment = .center

    var body: some View {
        VStack(alignment: alignment, spacing: 1) {
            HStack(spacing: 7) {
                TaskActivityDisc(state: header.disc, size: 16, surface: HausPlatformColor.canvas)
                Text(header.title)
                    .font(HausFont.font(size: 17, weight: .medium))
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            Text(subtitle ?? header.disc.label)
                .font(.caption)
                .foregroundStyle(HausPlatformColor.mutedInk)
        }
        .fixedSize(horizontal: alignment == .leading, vertical: false)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(header.title)
        .accessibilityValue(header.disc.label)
        .accessibilityAddTraits(.isHeader)
    }
}
