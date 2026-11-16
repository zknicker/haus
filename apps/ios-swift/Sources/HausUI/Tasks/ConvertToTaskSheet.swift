import HausModels
import SwiftUI

public extension View {
    /// Convert to Task on the message `message` names: the sheet, then the line
    /// that says what it made. The reader stays in the conversation they were
    /// reading, as on the App, and the line is the way into the Task.
    func convertToTask(
        _ message: Binding<MessagePresentation?>,
        source: TaskBoardSource,
        onOpenTask: @escaping (String) -> Void
    ) -> some View {
        modifier(ConvertToTaskPresenter(message: message, source: source, onOpenTask: onOpenTask))
    }
}

private struct ConvertToTaskPresenter: ViewModifier {
    @Binding var message: MessagePresentation?
    let source: TaskBoardSource
    let onOpenTask: (String) -> Void
    @State private var created: BoardTask?

    func body(content: Content) -> some View {
        content
            .sheet(item: $message) { message in
                ConvertToTaskSheet(message: message, source: source) { task in
                    withAnimation(.snappy) { created = task }
                }
            }
            // An overlay, so nothing in the transcript moves to make room.
            .overlay(alignment: .top) {
                if let created {
                    TaskCreatedBar(task: created) {
                        self.created = nil
                        onOpenTask(created.id)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .task(id: created?.id) { await expireNotice() }
    }

    /// Long enough to read the line and reach for it.
    private func expireNotice() async {
        guard created != nil else { return }
        try? await Task.sleep(for: .seconds(6))
        guard !Task.isCancelled else { return }
        withAnimation(.snappy) { created = nil }
    }
}

/// `SEC-12 created`, and the way into it.
private struct TaskCreatedBar: View {
    let task: BoardTask
    let onOpen: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            Text("\(task.key) created")
                .font(.subheadline)
                .frame(maxWidth: .infinity, alignment: .leading)
            Button("Open Task", action: onOpen)
                .font(.subheadline.weight(.semibold))
                .buttonStyle(.borderless)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: HausRadius.medium, style: .continuous))
        .accessibilityElement(children: .contain)
    }
}

/// A board and a title, and nothing else. The Server fills the description from
/// the message and records it as the Task's first Mentioned in, so the message
/// itself is left exactly as it was.
///
/// Claims are not involved: a human never makes one, and a converted Task is a
/// board record of its own (ADR 0051).
private struct ConvertToTaskSheet: View {
    private let messageID: String
    private let source: TaskBoardSource
    private let onCreated: (BoardTask) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    /// The reader's pick. Nil until they make one, when the first open board
    /// stands, which is General on every Server.
    @State private var boardID: String?
    @State private var isSaving = false
    @State private var errorMessage: String?

    init(message: MessagePresentation, source: TaskBoardSource, onCreated: @escaping (BoardTask) -> Void) {
        messageID = message.id
        self.source = source
        self.onCreated = onCreated
        _title = State(initialValue: ConvertToTaskTitle.fromMessage(prose: message.prose))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Board", selection: selectedBoardID) {
                        ForEach(openBoards) { board in
                            Text(board.name).tag(String?.some(board.id))
                        }
                    }
                    .pickerStyle(.menu)
                    TextField("Title", text: $title, axis: .vertical)
                        .lineLimit(1...4)
                } footer: {
                    if let errorMessage {
                        Text(errorMessage).foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Convert to Task")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create Task") { Task { await create() } }
                        .disabled(!canCreate)
                }
            }
            .task { await loadBoards() }
        }
        .presentationDetents([.medium])
    }

    /// An archived board refuses new Tasks.
    private var openBoards: [Board] {
        (source.boards() ?? []).filter { !$0.isArchived }
    }

    private var selectedBoardID: Binding<String?> {
        Binding(
            get: { boardID ?? openBoards.first?.id },
            set: { boardID = $0 }
        )
    }

    private var trimmedTitle: String {
        title.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var canCreate: Bool {
        !isSaving && !trimmedTitle.isEmpty && selectedBoardID.wrappedValue != nil
    }

    private func loadBoards() async {
        do {
            try await source.loadBoards()
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = error.localizedDescription
        }
    }

    private func create() async {
        guard let boardID = selectedBoardID.wrappedValue else { return }
        isSaving = true
        defer { isSaving = false }
        let draft = TaskDraft(
            boardID: boardID,
            title: trimmedTitle,
            description: "",
            columnID: nil,
            assignee: nil,
            priority: .none,
            labelIDs: [],
            dueOn: nil,
            sourceMessageID: messageID
        )
        do {
            let task = try await source.createTask(draft)
            dismiss()
            onCreated(task)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

/// The title Convert to Task offers, the App's `firstLineTitle`.
enum ConvertToTaskTitle {
    private static let maxLength = 200

    /// The message's first line that says anything, flattened the way every
    /// quoting surface flattens one, and cut to what a Task title may hold.
    static func fromMessage(prose: String) -> String {
        let firstLine = prose
            .split(whereSeparator: \.isNewline)
            .first { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .map(String.init) ?? ""
        let line = RichMessageParser.oneLinePreview(firstLine)
        return String(line.prefix(maxLength)).trimmingCharacters(in: .whitespaces)
    }
}

#Preview("Convert to Task") {
    ConvertToTaskSheet(
        message: MessagePresentation(
            id: "message_preview",
            author: MessageAuthorPresentation(id: "agent_zero", name: "Zero", avatarURL: nil),
            content: "Rate-limit Trigger webhook endpoints per secret\n\nA leaked URL can be hammered.",
            createdAt: .now
        ),
        source: .preview,
        onCreated: { _ in }
    )
}
