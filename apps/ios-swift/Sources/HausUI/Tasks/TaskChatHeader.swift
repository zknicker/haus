import HausModels
import SwiftUI

/// The band under a Task's navigation bar (ADR 0052 decision 15): the Task's
/// title and state, then the work attached to it — each cloud agent with its
/// newest Run's status and summary, and each pull request no cloud agent
/// already shows. It sits in the layout above the transcript, never over it,
/// so nothing it does moves a message. At large text sizes it stops growing at
/// a fraction of the screen and scrolls inside itself, so the conversation
/// always keeps most of the screen.
struct TaskChatHeader: View {
    let header: TaskChatHeaderPresentation
    let maxHeight: CGFloat
    /// The cloud agent whose full card is open; one at a time.
    @State private var expandedAgentID: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ViewThatFits(in: .vertical) {
            content
            ScrollView(.vertical) { content }
                .scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxHeight: maxHeight, alignment: .top)
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                // Wraps rather than truncating at every text size.
                Text(header.title)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    TaskStateDisc(state: header.state, size: 15)
                        .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 2 }
                    Text(header.stateLabel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("State: \(header.stateLabel)")
            }

            ForEach(header.attachedWork.cloudAgents) { agent in
                TaskCloudAgentRow(
                    agent: agent,
                    isExpanded: expandedAgentID == agent.id,
                    onToggle: { toggle(agent.id) }
                )
            }
            ForEach(header.attachedWork.pullRequests) { pullRequest in
                TaskPullRequestRow(pullRequest: pullRequest)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func toggle(_ id: String) {
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.36, dampingFraction: 0.88)) {
            expandedAgentID = expandedAgentID == id ? nil : id
        }
    }
}

/// One attached cloud agent: its mark and title, the newest Run's status in a
/// person's words, and that Run's summary. Tapping opens the full card — the
/// same `CloudAgentCard` the Chat draws, with its pull request and actions.
private struct TaskCloudAgentRow: View {
    let agent: CloudAgentPresentation
    let isExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onToggle) {
                HStack(alignment: .top, spacing: 10) {
                    CloudAgentMark(provider: agent.work.provider, size: 28)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(agent.work.title)
                            .font(.subheadline.weight(.semibold))
                            .fixedSize(horizontal: false, vertical: true)
                        Text(agent.runStatusText)
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(statusColor)
                        if let summary = agent.newestRunSummary {
                            Text(summary)
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .lineLimit(isExpanded ? nil : 2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressableRow(cornerRadius: HausRadius.medium))
            .accessibilityElement(children: .combine)
            .accessibilityHint(isExpanded ? "Hides the cloud agent card" : "Shows the cloud agent card")

            if isExpanded {
                CloudAgentCard(agent: agent)
                    .transition(.opacity)
            }
        }
    }

    /// The one point of color: a Run waiting on someone, or one that failed.
    private var statusColor: Color {
        switch agent.newestRun?.status ?? agent.work.status {
        case .pendingInput: CloudAgentTone.warning
        case .failed: .red
        case .running, .queued: .accentColor
        case .completed, .cancelled, .expired: .secondary
        }
    }
}

/// One attached pull request no cloud agent card already shows, opening on GitHub.
private struct TaskPullRequestRow: View {
    let pullRequest: TaskPullRequestPresentation

    var body: some View {
        if let url = pullRequest.url {
            Link(destination: url) { label }
                .buttonStyle(.pressableRow(cornerRadius: HausRadius.medium))
                .accessibilityHint("Opens the pull request")
        } else {
            label
        }
    }

    private var label: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "arrow.triangle.pull")
                .font(.subheadline.weight(.semibold))
                .frame(width: 28, height: 28)
                .foregroundStyle(.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(pullRequest.title)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Text("\(pullRequest.stateLabel) · \(pullRequest.facts)")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}
