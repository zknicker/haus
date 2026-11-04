import HausModels
import SwiftUI

/// The Tasks destination: every board, with how much is open on each, and New
/// board. A stock inset-grouped list, because this screen is a choice of where
/// to go rather than a view of work.
public struct TaskBoardPickerView: View {
    private let source: TaskBoardSource
    private let onOpenBoard: (String) -> Void

    @State private var failure: String?
    @State private var showsNewBoard = false

    public init(source: TaskBoardSource, onOpenBoard: @escaping (String) -> Void) {
        self.source = source
        self.onOpenBoard = onOpenBoard
    }

    public var body: some View {
        content
            .navigationTitle("Tasks")
            .hausInlineNavigationTitle()
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button { showsNewBoard = true } label: {
                        Label("New board", systemImage: "plus")
                    }
                }
            }
            .task { await load() }
            .refreshable { await load() }
            .sheet(isPresented: $showsNewBoard) {
                NewBoardSheet(source: source, onCreated: onOpenBoard)
            }
    }

    @ViewBuilder
    private var content: some View {
        if let boards = source.boards() {
            list(boards)
        } else if let failure {
            ContentUnavailableView {
                Label("Tasks unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(failure)
            } actions: {
                Button("Try again") { Task { await load() } }
                    .buttonStyle(.borderedProminent)
            }
        } else {
            // Blank on purpose: the destination arrives empty and fills in one
            // step, instead of flashing a spinner on fast loads.
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func list(_ boards: [Board]) -> some View {
        List {
            Section {
                ForEach(boards.filter { !$0.isArchived }) { row($0) }
            }
            let archived = boards.filter(\.isArchived)
            if !archived.isEmpty {
                Section("Archived") {
                    ForEach(archived) { row($0) }
                }
            }
        }
        #if os(iOS)
        .listStyle(.insetGrouped)
        #endif
    }

    private func row(_ board: Board) -> some View {
        Button { onOpenBoard(board.id) } label: {
            HStack(spacing: 10) {
                Text(board.name)
                    .foregroundStyle(.primary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(board.key)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if board.openTaskCount > 0 {
                    Text("\(board.openTaskCount)")
                        .font(.subheadline)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(board.name)
        .accessibilityValue("\(board.key), \(board.openTaskCount) open")
    }

    private func load() async {
        do {
            try await source.loadBoards()
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            failure = error.localizedDescription
        }
    }
}

#Preview("Boards") {
    NavigationStack {
        TaskBoardPickerView(source: .preview, onOpenBoard: { _ in })
    }
}
