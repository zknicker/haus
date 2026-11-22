import SwiftUI

/// The Projects tab's root. Until Projects is rebuilt it hosts the drawer's
/// list as it was: Projects with `#all`, then People and Captain DMs, then
/// Archived.
public struct ProjectsTabView: View {
    private static let listInset: CGFloat = 8
    private static let rowCapsuleBleed: CGFloat = 12

    private let destinations: [ChatDestination]
    private let isLoaded: Bool
    private let onOpen: (ChatDestination) -> Void
    private let onMarkRead: (ChatPresentation) -> Void
    private let onOpenDetails: (ChatDestination) -> Void
    private let onOpenArchived: () -> Void
    private let onNewProject: () -> Void

    @ScaledMetric(relativeTo: .body) private var rowGlyphSize: CGFloat = 26
    @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = 42
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(
        destinations: [ChatDestination],
        isLoaded: Bool,
        onOpen: @escaping (ChatDestination) -> Void,
        onMarkRead: @escaping (ChatPresentation) -> Void,
        onOpenDetails: @escaping (ChatDestination) -> Void,
        onOpenArchived: @escaping () -> Void,
        onNewProject: @escaping () -> Void
    ) {
        self.destinations = destinations
        self.isLoaded = isLoaded
        self.onOpen = onOpen
        self.onMarkRead = onMarkRead
        self.onOpenDetails = onOpenDetails
        self.onOpenArchived = onOpenArchived
        self.onNewProject = onNewProject
    }

    public var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 5) {
                if isLoaded, channels.isEmpty {
                    emptyProjects
                } else if !channels.isEmpty {
                    sectionHeader("Projects")
                    ForEach(channels) { row($0) }
                }
                if !people.isEmpty {
                    sectionHeader("People").padding(.top, 10)
                    ForEach(people) { row($0) }
                }
                if isLoaded {
                    archivedRow.padding(.top, 10)
                }
            }
            .padding(.horizontal, Self.listInset)
            .padding(.bottom, 24)
            .animation(.snappy(duration: 0.35), value: destinations.map(\.id))
        }
        .scrollIndicators(.hidden)
        .background(HausPlatformColor.background)
        .navigationTitle("Projects")
        .hausInlineNavigationTitle()
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button("New project", systemImage: "plus", action: onNewProject)
            }
        }
    }

    private var channels: [ChatDestination] {
        destinations.filter { $0.kind.isChannel }
    }

    private var people: [ChatDestination] {
        destinations.filter { !$0.kind.isChannel }
    }

    private var metrics: SidebarRowMetrics {
        SidebarRowMetrics(
            glyph: min(rowGlyphSize, 40),
            rowHeight: rowHeight,
            capsuleBleed: Self.rowCapsuleBleed,
            listInset: Self.listInset,
            isAccessibilitySize: dynamicTypeSize.isAccessibilitySize
        )
    }

    private var emptyProjects: some View {
        VStack(spacing: 10) {
            Text("No projects yet")
                .font(.headline)
            Text("A project is where people and Captains work together.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button("New project", action: onNewProject)
                .buttonStyle(.glassProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.body)
            .foregroundStyle(HausPlatformColor.secondaryLabel)
            .padding(.horizontal, Self.rowCapsuleBleed)
            .frame(minHeight: 34)
            .accessibilityAddTraits(.isHeader)
    }

    private func row(_ chat: ChatDestination) -> some View {
        SidebarChatRow(
            chat: chat,
            isSelected: false,
            metrics: metrics,
            onSelect: { onOpen(chat) },
            onMarkRead: markReadAction(for: chat),
            onOpenDetails: { onOpenDetails(chat) }
        )
    }

    private var archivedRow: some View {
        Button(action: onOpenArchived) {
            HStack(spacing: 10) {
                Image(systemName: "archivebox")
                    .frame(width: metrics.glyph, height: metrics.glyph)
                    .foregroundStyle(HausPlatformColor.secondaryLabel)
                Text("Archived")
                Spacer(minLength: 0)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
            .sidebarRowFrame(metrics, isSelected: false)
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressableRow(cornerRadius: metrics.pressRadius))
    }

    private func markReadAction(for chat: ChatDestination) -> (() -> Void)? {
        guard chat.unreadCount > 0, let durable = chat.durableChat else { return nil }
        return { onMarkRead(durable) }
    }
}
