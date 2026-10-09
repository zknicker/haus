import SwiftUI
import HausModels
#if os(iOS)
import UIKit
#endif

/// The Cloud Agent work under the Message that delegated it — the same card
/// in the Chat transcript and inside its Thread. Four parts, top to bottom:
/// the header (mark, title, the job's state, the repository), the pull
/// request once one exists, exactly one status line, and the actions. The
/// headline is the job's state in Cursor's vocabulary, so a follow-up waiting
/// in Haus's queue never turns a finished job back into "Queued". The status
/// line is always there and always one line, so the card changes height only
/// when its pull request first appears. One text size throughout; weight and
/// color carry the hierarchy. The Message's author line above already says
/// who delegated it and when.
///
/// The compact form is the same card cut to its header — mark, title, the
/// repository and the job's chip — for a working job listed in an expanded
/// Thread stack, where the full card adds nothing but its actions.
struct CloudAgentCard: View {
    let agent: CloudAgentPresentation
    var isCompact = false
    @Environment(\.cloudAgentCancel) private var cancelAction
    @Environment(\.openURL) private var openURL
    @State private var confirmingCancel = false
    @State private var cancelling = false
    @State private var cancelError: String?

    var body: some View {
        TimelineView(.periodic(from: .now, by: isLive ? 1 : 60)) { context in
            if isCompact {
                header(now: context.date, titleLineLimit: 1)
            } else {
                content(now: context.date)
            }
        }
        .font(.subheadline)
        .padding(.horizontal, CloudAgentCardMetrics.padding)
        .padding(.vertical, isCompact ? 10 : CloudAgentCardMetrics.padding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .cloudAgentCardSurface(HausPlatformColor.inputSurface)
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

    private func content(now: Date) -> some View {
        let line = agent.statusLine(agentName: agent.agentName, at: now)
        return VStack(alignment: .leading, spacing: 10) {
            header(now: now, titleLineLimit: nil)

            VStack(alignment: .leading, spacing: 4) {
                if let number = agent.pullRequestNumber {
                    CloudAgentPullRequestRow(number: number, pullRequest: agent.branch?.pullRequest)
                }
                Text(line.text)
                    .foregroundStyle(CloudAgentTone.color(for: line.tone))
                    .lineLimit(1)
                    .truncationMode(.tail)
                    .accessibilityIdentifier("cloud-agent-status-line")
            }

            actions
        }
    }

    private func header(now: Date, titleLineLimit: Int?) -> some View {
        HStack(alignment: .top, spacing: 10) {
            CloudAgentMark()
            VStack(alignment: .leading, spacing: 4) {
                Text(agent.work.title).fontWeight(.semibold)
                    .lineLimit(titleLineLimit)
                    .fixedSize(horizontal: false, vertical: titleLineLimit == nil)
                    .frame(maxWidth: .infinity, alignment: .leading)
                // The chip shares the one-line repository row, so its
                // ticking width can only truncate the repository, never
                // rewrap the title and move the card's height. The mark
                // names the provider; the repository says only where.
                HStack(spacing: 8) {
                    Text(agent.work.repository).foregroundStyle(.secondary).lineLimit(1)
                    Spacer(minLength: 0)
                    CloudAgentJobChip(state: agent.work.job.state, text: agent.jobText(at: now))
                }
            }
        }
    }

    /// A live job counts up; a settled one only ages its relative time.
    private var isLive: Bool { agent.work.job.state == .working || agent.work.job.followUp != nil }

    /// "View PR" leads once there is a pull request, because the result is
    /// what a reader came for; the provider's own page is always next, beside
    /// a chevron menu with the rarer actions.
    private var actions: some View {
        let providerURL = CloudAgentPresentation.externalURL(agent.work.providerUrl)
        return HStack(spacing: 6) {
            if let url = agent.pullRequestURL {
                Link(destination: url) { actionLabel("View PR", systemImage: "arrow.triangle.pull") }
                    .buttonStyle(.borderedProminent)
            }
            Button {
                if let providerURL { openURL(providerURL) }
            } label: {
                actionLabel("Open in \(agent.providerName)", systemImage: "arrow.up.right")
            }
            .disabled(providerURL == nil)
            Menu {
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
            .disabled(agent.conversationLink == nil && !canCancel)
        }
        .fixedSize(horizontal: false, vertical: true)
        .buttonStyle(.bordered)
        // An explicit tint: with the inherited one these controls drew gray
        // and read as disabled. Label ink reads as live on both appearances.
        .tint(HausPlatformColor.label)
        .controlSize(.small)
        .fontWeight(.medium)
        .lineLimit(1)
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

/// The headline chip: the job's glyph and its state, tinted by the one tone rule.
private struct CloudAgentJobChip: View {
    let state: CloudAgentJobState
    let text: String

    var body: some View {
        let tint = CloudAgentTone.color(for: state)
        HStack(spacing: 4) {
            CloudAgentStatusGlyph(state: state, size: 13)
            Text(text).fontWeight(.semibold).monospacedDigit()
        }
        .foregroundStyle(tint)
        .lineLimit(1)
        .padding(.horizontal, 8)
        .padding(.vertical, 3)
        .background(tint.opacity(0.14), in: .capsule)
        .fixedSize()
    }
}

/// The result, once there is one: the pull request's number, its own state
/// when the Computer's GitHub reading has it, and the size of the change.
/// Added and removed are the one pair a reader scans without reading, so they
/// keep color.
private struct CloudAgentPullRequestRow: View {
    let number: Int
    let pullRequest: CloudAgentPullRequest?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Image(systemName: "arrow.triangle.pull").foregroundStyle(.secondary)
            (Text("PR #\(number)").fontWeight(.medium).foregroundColor(HausPlatformColor.label)
                + details)
                .lineLimit(1)
        }
        .accessibilityIdentifier("cloud-agent-pull-request")
    }

    private var details: Text {
        guard let pullRequest else { return Text("") }
        let files = "\(pullRequest.changedFiles) \(pullRequest.changedFiles == 1 ? "file" : "files")"
        return Text(" · \(Self.stateLabel(pullRequest.state)) · \(files)").foregroundColor(.secondary)
            + Text(" +\(pullRequest.additions)").foregroundColor(.green)
            + Text(" −\(pullRequest.deletions)").foregroundColor(.red)
    }

    static func stateLabel(_ state: String) -> String {
        switch state {
        case "draft": "Draft"
        case "open": "Open"
        case "merged": "Merged"
        case "closed": "Closed"
        default: state.capitalized
        }
    }
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

/// The card's box: the inset its contents sit in and the corner that inset is
/// cut with, kept together so the two stay in step when either moves.
enum CloudAgentCardMetrics {
    static let padding: CGFloat = 12
    static let cornerRadius: CGFloat = HausRadius.medium
}

extension View {
    /// The card's box in one fill. The page background goes under the
    /// translucent system fill so a card stays opaque over whatever sits
    /// behind it — the peeking edges of a Thread stack included.
    func cloudAgentCardSurface(_ fill: Color) -> some View {
        background {
            RoundedRectangle.haus(CloudAgentCardMetrics.cornerRadius)
                .fill(HausPlatformColor.background)
                .overlay { RoundedRectangle.haus(CloudAgentCardMetrics.cornerRadius).fill(fill) }
        }
        .overlay {
            RoundedRectangle.haus(CloudAgentCardMetrics.cornerRadius)
                .strokeBorder(.secondary.opacity(0.18), lineWidth: 0.5)
        }
    }
}
