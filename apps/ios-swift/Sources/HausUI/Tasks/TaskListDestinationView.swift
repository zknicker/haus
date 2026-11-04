import HausModels
import SwiftUI

/// The narrow App-layer seam for the Server claim lens.
///
/// The default lens is the Server-wide read the Store already owns, so the
/// screen reads that snapshot rather than keeping a second copy of the same
/// query: a `claim.onChanged` notification refreshes it and this
/// screen repaints without anyone pulling to refresh. Only the widened lens —
/// a reader deliberately looking at the background tier — comes back through
/// `load`, because it is a different question and a temporary one.
public struct TaskListPersistence: Sendable {
    /// The claim's assignee Agent as the App layer resolved it, or `nil` when
    /// the claim is unassigned or the Agent is missing from the directory.
    /// Rows derive both the avatar and the assignee label from this, so there
    /// is no second name to disagree with the Thread claim drawer.
    public let assignee: @Sendable (ClaimListItem) -> MessageAuthorPresentation?
    /// The Store's Server-wide default lens, `nil` before its first load.
    public let claims: @MainActor @Sendable () -> [ClaimListItem]?
    /// How many background-tier rows that lens hid.
    public let backgroundCount: @MainActor @Sendable () -> Int
    /// Reloads a lens. The default lens lands on the Store snapshot above; the
    /// widened rows are returned to the caller.
    public let load: @Sendable (_ includeBackground: Bool) async throws -> [ClaimListItem]
    public let updateStatus: @Sendable (ClaimListItem, ClaimStatus) async throws -> Void

    public init(
        assignee: @escaping @Sendable (ClaimListItem) -> MessageAuthorPresentation? = { _ in nil },
        claims: @escaping @MainActor @Sendable () -> [ClaimListItem]?,
        backgroundCount: @escaping @MainActor @Sendable () -> Int = { 0 },
        load: @escaping @Sendable (Bool) async throws -> [ClaimListItem],
        updateStatus: @escaping @Sendable (ClaimListItem, ClaimStatus) async throws -> Void
    ) {
        self.assignee = assignee
        self.claims = claims
        self.backgroundCount = backgroundCount
        self.load = load
        self.updateStatus = updateStatus
    }
}

extension TaskListPersistence {
    static let preview = TaskListPersistence(
        assignee: { item in
            item.claim.assigneeAgentID.map {
                MessageAuthorPresentation(id: $0, name: "Cove", avatarURL: nil)
            }
        },
        claims: { TaskPreviewFixtures.items },
        backgroundCount: { TaskPreviewFixtures.backgroundItems.count },
        load: { includeBackground in
            includeBackground ? TaskPreviewFixtures.widenedItems : TaskPreviewFixtures.items
        },
        updateStatus: { _, _ in }
    )
}

/// Server-backed Tasks destination pushed on the root stack from the sidebar.
///
/// Refresh and mutation errors stay local to this destination while the App
/// layer owns authorization, tRPC, and the Store snapshot. Opening a row
/// delegates to the existing canonical Thread route.
public struct TaskListDestinationView: View {
    private let persistence: TaskListPersistence
    private let onOpenClaim: (ClaimListItem) -> Void

    /// The reader's own widening, and the rows it asked for. View-local: the
    /// background tier is a lens someone opens for a moment, not Server state.
    @State private var includeBackground = false
    @State private var widenedItems: [ClaimListItem]?
    @State private var failure: String?
    @State private var errorMessage: String?
    @State private var mutatingIDs: Set<String> = []
    @State private var reloadToken = 0
    @State private var mutationSuccessFeedback = 0

    public init(
        persistence: TaskListPersistence,
        onOpenClaim: @escaping (ClaimListItem) -> Void
    ) {
        self.persistence = persistence
        self.onOpenClaim = onOpenClaim
    }

    public var body: some View {
        content
            .navigationTitle("Tasks")
            .hausInlineNavigationTitle()
            .toolbar { backgroundToggle }
            .task(id: "\(includeBackground):\(reloadToken)") {
                await loadClaims()
            }
            .refreshable {
                await loadClaims()
            }
            .sensoryFeedback(.success, trigger: mutationSuccessFeedback)
    }

    /// The rows on screen: the Store's own lens, or the widened one the reader
    /// asked for. `nil` means nothing has landed yet.
    private var items: [ClaimListItem]? {
        includeBackground ? widenedItems : persistence.claims()
    }

    @ViewBuilder
    private var content: some View {
        if let items {
            VStack(spacing: 0) {
                if let errorMessage {
                    Label(errorMessage, systemImage: "exclamationmark.triangle")
                        .font(.footnote)
                        .foregroundStyle(.red)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                }

                TaskListLensView(
                    items: items,
                    assignee: persistence.assignee,
                    mutatingIDs: mutatingIDs,
                    onOpenClaim: onOpenClaim,
                    onUpdateStatus: { item, status in
                        Task { await mutate(item) { try await persistence.updateStatus(item, status) } }
                    }
                )
            }
        } else if let failure {
            ContentUnavailableView {
                Label("Tasks unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(failure)
            } actions: {
                Button("Try again") {
                    reloadToken += 1
                }
                .buttonStyle(.borderedProminent)
            }
        } else {
            // Blank on purpose: the destination arrives empty and fills in one
            // step, instead of flashing a spinner on fast loads.
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// The lens control is words, not a button: it states how much the list is
    /// not showing, which is a footnote on the list rather than an action the
    /// screen is offering. The navigation bar wraps its items in glass on its
    /// own, which turned that footnote into a filled pill, so the item drops
    /// the shared background where the system draws one — matching the App's
    /// ghost button.
    @ToolbarContentBuilder
    private var backgroundToggle: some ToolbarContent {
        if #available(iOS 26.0, macOS 26.0, *) {
            backgroundToggleItem.sharedBackgroundVisibility(.hidden)
        } else {
            backgroundToggleItem
        }
    }

    private var backgroundToggleItem: some ToolbarContent {
        ToolbarItem(placement: .automatic) {
            if let label = TaskBackgroundLens.label(
                items: items ?? [],
                hiddenCount: persistence.backgroundCount(),
                includeBackground: includeBackground
            ) {
                Button(label) {
                    includeBackground.toggle()
                    widenedItems = nil
                }
                .buttonStyle(.plain)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }
        }
    }

    private func loadClaims() async {
        errorMessage = nil
        do {
            let rows = try await persistence.load(includeBackground)
            guard !Task.isCancelled else { return }
            if includeBackground {
                widenedItems = rows
            }
            failure = nil
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            if items == nil {
                failure = error.localizedDescription
            } else {
                errorMessage = error.localizedDescription
            }
        }
    }

    private func mutate(
        _ item: ClaimListItem,
        operation: @escaping @Sendable () async throws -> Void
    ) async {
        guard mutatingIDs.isEmpty else { return }
        mutatingIDs.insert(item.id)
        defer { mutatingIDs.remove(item.id) }

        do {
            try await operation()
            guard !Task.isCancelled else { return }
            mutationSuccessFeedback += 1
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = error.localizedDescription
            return
        }
        await loadClaims()
    }
}

#Preview("Tasks destination") {
    NavigationStack {
        TaskListDestinationView(
            persistence: .preview,
            onOpenClaim: { _ in }
        )
    }
}
