import Foundation
import SwiftUI

public struct ArchivedChannelPresentation: Identifiable, Hashable, Sendable {
    public let id: String
    public let name: String
    public let archivedAt: Date
    public let appearance: ChannelAppearance

    public init(
        id: String,
        name: String,
        archivedAt: Date,
        appearance: ChannelAppearance = .default
    ) {
        self.id = id
        self.name = name
        self.archivedAt = archivedAt
        self.appearance = appearance
    }
}

/// Server-backed archived channel management. The view owns transient loading
/// and restore state; the host owns cache invalidation and authorization.
public struct ArchivedChannelsView: View {
    @Environment(\.dismiss) private var dismiss

    private let load: @Sendable () async throws -> [ArchivedChannelPresentation]
    private let restore: @Sendable (ArchivedChannelPresentation) async throws -> Void
    private let onRestored: (ArchivedChannelPresentation) -> Void

    @State private var state: LoadState = .loading
    @State private var restoringIDs: Set<String> = []
    @State private var errorMessage: String?
    @State private var reloadToken = 0

    /// - Parameter onRestored: hands the restored channel to the shell, which
    ///   dismisses this sheet and selects the channel once the Server list
    ///   carries it again.
    public init(
        load: @escaping @Sendable () async throws -> [ArchivedChannelPresentation],
        restore: @escaping @Sendable (ArchivedChannelPresentation) async throws -> Void,
        onRestored: @escaping (ArchivedChannelPresentation) -> Void = { _ in }
    ) {
        self.load = load
        self.restore = restore
        self.onRestored = onRestored
    }

    public var body: some View {
        NavigationStack {
            content
                .navigationTitle("Archived projects")
                .hausInlineNavigationTitle()
                .toolbar {
                    ToolbarItem(placement: .confirmationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
        .task(id: reloadToken) {
            await loadChannels()
        }
        .refreshable {
            await loadChannels()
        }
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .presentationBackground(HausPlatformColor.groupedBackground)
    }

    @ViewBuilder
    private var content: some View {
        switch state {
        case .loading:
            // Blank on purpose: the sheet arrives empty and fills in one
            // step, instead of flashing a spinner on fast loads.
            Color.clear
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        case let .loaded(channels):
            if channels.isEmpty {
                ContentUnavailableView(
                    "No archived projects",
                    systemImage: "archivebox",
                    description: Text("Projects you archive will appear here.")
                )
            } else {
                VStack(spacing: 0) {
                    if let errorMessage {
                        Label(errorMessage, systemImage: "exclamationmark.triangle")
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 8)
                    }

                    List(channels) { channel in
                        ArchivedChannelRow(
                            channel: channel,
                            isRestoring: restoringIDs.contains(channel.id),
                            onRestore: { Task { await restoreChannel(channel) } }
                        )
                        .listRowInsets(.init(top: 8, leading: 16, bottom: 8, trailing: 16))
                        .listRowSeparator(.hidden)
                    }
                    .listStyle(.plain)
                }
            }
        case let .failed(message):
            ContentUnavailableView {
                Label("Archived projects unavailable", systemImage: "exclamationmark.triangle")
            } description: {
                Text(message)
            } actions: {
                Button("Try again") {
                    reloadToken += 1
                }
                .buttonStyle(.borderedProminent)
            }
        }
    }

    private func loadChannels() async {
        // A refresh with content on screen keeps the loaded list rendered;
        // only a not-yet-loaded sheet enters the blank loading state.
        if case .loaded = state {} else {
            state = .loading
        }
        errorMessage = nil
        do {
            let channels = try await load()
            guard !Task.isCancelled else { return }
            state = .loaded(channels)
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            if case .loaded = state {
                errorMessage = error.localizedDescription
            } else {
                state = .failed(error.localizedDescription)
            }
        }
    }

    private func restoreChannel(_ channel: ArchivedChannelPresentation) async {
        guard !restoringIDs.contains(channel.id) else { return }
        restoringIDs.insert(channel.id)
        defer { restoringIDs.remove(channel.id) }

        do {
            try await restore(channel)
            guard !Task.isCancelled else { return }
            if case let .loaded(channels) = state {
                state = .loaded(channels.filter { $0.id != channel.id })
            }
            errorMessage = nil
            onRestored(channel)
        } catch is CancellationError {
            return
        } catch {
            guard !Task.isCancelled else { return }
            errorMessage = error.localizedDescription
        }
    }

    private enum LoadState {
        case loading
        case loaded([ArchivedChannelPresentation])
        case failed(String)
    }
}

private struct ArchivedChannelRow: View {
    let channel: ArchivedChannelPresentation
    let isRestoring: Bool
    let onRestore: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            ChannelIconBox(appearance: channel.appearance, size: 28)

            VStack(alignment: .leading, spacing: 3) {
                Text(channel.name)
                    .font(.body.weight(.medium))
                    .foregroundStyle(.primary)
                    .lineLimit(1)
                Text("Archived \(channel.archivedAt, format: .dateTime.month(.abbreviated).day().year())")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Spacer(minLength: 8)

            if isRestoring {
                ProgressView()
                    .controlSize(.small)
            } else {
                Button("Restore", action: onRestore)
                    .buttonStyle(.bordered)
                    .controlSize(.small)
            }
        }
        .padding(.vertical, 6)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(channel.name), archived")
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button("Restore", action: onRestore)
                .tint(HausPlatformColor.accentInk)
        }
    }
}

private enum ArchivedChannelPreviewFixtures {
    static let channels = [
        ArchivedChannelPresentation(
            id: "archived-product",
            name: "product",
            archivedAt: .now.addingTimeInterval(-86_400),
            appearance: ChannelAppearance(icon: "RocketIcon", color: "violet")
        ),
        ArchivedChannelPresentation(
            id: "archived-release",
            name: "release-checklist",
            archivedAt: .now.addingTimeInterval(-604_800)
        ),
    ]
}

#Preview("Archived channels") {
    ArchivedChannelsView(
        load: { ArchivedChannelPreviewFixtures.channels },
        restore: { _ in }
    )
}

#Preview("Archived channels empty") {
    ArchivedChannelsView(load: { [] }, restore: { _ in })
}

#Preview("Archived channels error") {
    ArchivedChannelsView(
        load: {
            struct PreviewError: LocalizedError {
                var errorDescription: String? { "The Server could not be reached." }
            }
            throw PreviewError()
        },
        restore: { _ in }
    )
}
