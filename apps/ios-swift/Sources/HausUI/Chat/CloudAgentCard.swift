import SwiftUI
import HausModels
#if os(iOS)
import UIKit
#endif

/// The Cloud Agent work under the Message that delegated it — the same card
/// in the Chat transcript and inside its Thread. Facts, then one control band:
/// what the work is and how it is going, the branch and pull request it wrote,
/// the diff size, and what it is doing now. The Message's author line above
/// already says who delegated it and when, and the Thread preview below (once
/// replies exist) is the way into the Thread, so the card carries neither.
struct CloudAgentCard: View {
    let agent: CloudAgentPresentation
    @Environment(\.cloudAgentCancel) private var cancelAction
    @State private var confirmingCancel = false
    @State private var cancelling = false
    @State private var cancelError: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                CloudAgentMark()
                VStack(alignment: .leading, spacing: 3) {
                    Text(agent.work.title).font(.subheadline.weight(.semibold))
                        .fixedSize(horizontal: false, vertical: true)
                    // The mark names the provider; this line says only where.
                    Text(agent.work.repository).font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                TimelineView(.animation(minimumInterval: 1, paused: !agent.work.status.isActive)) { context in
                    CloudAgentCardStatusCapsule(status: CloudAgentCardStatus(
                        label: agent.statusText(at: context.date), tint: statusColor
                    ))
                }
            }

            VStack(alignment: .leading, spacing: 4) {
                Label {
                    HStack(spacing: 0) {
                        Text(agent.branchLabel).lineLimit(1).truncationMode(.middle)
                        if let number = agent.pullRequestNumber {
                            Text(" · PR #\(number)").fixedSize()
                        }
                    }
                } icon: { Image(systemName: "arrow.triangle.branch") }
                if let pr = agent.primaryBranch?.pullRequest {
                    Label {
                        HStack(spacing: 4) {
                            Text("\(pr.changedFiles) \(pr.changedFiles == 1 ? "file" : "files") changed")
                            Text("+\(pr.additions)").foregroundStyle(.green)
                            Text("−\(pr.deletions)").foregroundStyle(.red)
                        }
                    } icon: { Image(systemName: "plusminus") }
                }
                TimelineView(.animation(minimumInterval: 60, paused: !agent.work.status.isActive)) { context in
                    if let activity = activityText(at: context.date) {
                        Label { Text(activity).lineLimit(2) } icon: { Image(systemName: "waveform.path.ecg") }
                    }
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .labelStyle(CloudAgentMetaLabelStyle())

            actions
        }
        .padding(CloudAgentCardMetrics.padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(HausPlatformColor.inputSurface, in: .haus(CloudAgentCardMetrics.cornerRadius))
        .overlay {
            RoundedRectangle.haus(CloudAgentCardMetrics.cornerRadius)
                .strokeBorder(.secondary.opacity(0.18), lineWidth: 0.5)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("cloud-agent-card-\(agent.id)")
        .confirmationDialog("Cancel this cloud agent run?", isPresented: $confirmingCancel) {
            Button("Cancel run", role: .destructive) {
                Task {
                    cancelling = true
                    defer { cancelling = false }
                    do { try await cancelAction?.run(agent.id) }
                    catch { cancelError = "Could not cancel this run. Try again." }
                }
            }
        }
        .alert("Cloud agent", isPresented: Binding(
            get: { cancelError != nil }, set: { if !$0 { cancelError = nil } }
        )) {
            Button("OK", role: .cancel) { cancelError = nil }
        } message: { Text(cancelError ?? "") }
    }

    private var statusColor: Color {
        if agent.work.status.isActive, agent.work.cancelRequestedAt != nil { return .secondary }
        switch agent.work.status {
        case .completed: return .green
        case .failed, .expired: return .red
        case .queued, .running: return .blue
        case .cancelled: return .secondary
        }
    }

    private func activityText(at now: Date) -> String? {
        let stale = agent.isStale(at: now)
            ? "Last update \(agent.work.updatedAt.formatted(.relative(presentation: .named)))" : nil
        let parts = [agent.activityLine, stale].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }

    /// One primary action — the pull request once there is one, the
    /// provider's page until then — and a chevron menu with the rest.
    private var actions: some View {
        let providerURL = CloudAgentPresentation.externalURL(agent.work.providerUrl)
        let openInProvider = "Open in \(agent.providerName)"
        return HStack(spacing: 6) {
            if let url = agent.pullRequestURL {
                Link(destination: url) { actionLabel("View PR", systemImage: "arrow.triangle.pull") }
            } else if let providerURL {
                Link(destination: providerURL) { actionLabel(openInProvider, systemImage: "arrow.up.right") }
            }
            Menu {
                if let providerURL {
                    Link(destination: providerURL) { Label(openInProvider, systemImage: "arrow.up.right") }
                }
                if let link = agent.conversationLink {
                    Button { copy(link) } label: { Label("Copy link", systemImage: "link") }
                }
                if canCancel {
                    Button(role: .destructive) { confirmingCancel = true } label: {
                        Label("Cancel run", systemImage: "xmark.circle")
                    }
                    .disabled(cancelling)
                }
            } label: {
                Image(systemName: "chevron.down")
                    .frame(maxHeight: .infinity)
                    .accessibilityLabel("More cloud agent actions")
            }
        }
        .fixedSize(horizontal: false, vertical: true)
        .buttonStyle(.bordered)
        // An explicit tint: with the inherited one these controls drew gray
        // and read as disabled. Label ink reads as live on both appearances.
        .tint(HausPlatformColor.label)
        .controlSize(.small)
        .font(.caption.weight(.medium))
    }

    /// Icon and title packed together; a stock `Label` inherits whatever
    /// label style the surrounding list installs.
    private func actionLabel(_ title: String, systemImage: String) -> some View {
        HStack(spacing: 5) {
            Image(systemName: systemImage)
            Text(title)
        }
    }

    private func copy(_ link: URL) {
        #if os(iOS)
        UIPasteboard.general.url = link
        #endif
    }

    private var canCancel: Bool { cancelAction != nil && agent.canBeCancelled }
}

/// Cancels a Cloud Agent run by work id. The app installs it for Owners and
/// Admins; without it the card offers no Cancel run.
public struct CloudAgentCancelAction: Sendable {
    public let run: @Sendable (String) async throws -> Void
    public init(_ run: @escaping @Sendable (String) async throws -> Void) { self.run = run }
}

extension EnvironmentValues {
    @Entry public var cloudAgentCancel: CloudAgentCancelAction?
}

/// Icon and text on one baseline with a fixed icon column, so the card's
/// fact rows start their text at one inset.
private struct CloudAgentMetaLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            configuration.icon.frame(width: 14)
            configuration.title
        }
    }
}

/// The card's box: the inset its contents sit in and the corner that inset is
/// cut with, kept together so the two stay in step when either moves.
enum CloudAgentCardMetrics {
    static let padding: CGFloat = 12
    static let cornerRadius: CGFloat = HausRadius.medium
}

/// A finished-state fact about the run, drawn as a soft capsule. Work still
/// running carries a live one; work still waiting on a human carries none.
struct CloudAgentCardStatus: Equatable {
    let label: String
    let tint: Color
}

/// A finished-state fact, drawn the same size wherever it appears.
struct CloudAgentCardStatusCapsule: View {
    let status: CloudAgentCardStatus

    var body: some View {
        Text(status.label)
            .font(.caption.weight(.semibold))
            .foregroundStyle(status.tint)
            .lineLimit(1)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(status.tint.opacity(0.14), in: .capsule)
            .fixedSize()
    }
}
