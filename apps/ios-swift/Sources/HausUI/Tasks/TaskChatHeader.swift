import HausModels
import SwiftUI

/// The Task's attached work under the centered header, as a compact strip: one
/// line per Worker and pull request, a Worker card on tap. The title and state
/// live in the navigation bar. The Work view replaces this strip (W1).
struct TaskChatHeader: View {
    let attachedWork: TaskAttachedWorkPresentation
    let maxHeight: CGFloat
    @State private var expandedAgentID: String?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ViewThatFits(in: .vertical) {
            content
            ScrollView(.vertical) { content }
                .scrollBounceBehavior(.basedOnSize)
        }
        .frame(maxHeight: maxHeight, alignment: .top)
        .background(HausPlatformColor.canvas)
        .overlay(alignment: .bottom) {
            Rectangle().fill(HausPlatformColor.hairline).frame(height: 1)
        }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 2) {
            ForEach(attachedWork.cloudAgents) { agent in
                TaskWorkerRow(
                    agent: agent,
                    isExpanded: expandedAgentID == agent.id,
                    onToggle: { toggle(agent.id) }
                )
            }
            ForEach(attachedWork.pullRequests) { pullRequest in
                TaskPullRequestRow(pullRequest: pullRequest)
            }
        }
        .padding(.horizontal, 20)
        .padding(.vertical, 4)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func toggle(_ id: String) {
        withAnimation(reduceMotion ? .easeOut(duration: 0.15) : .spring(response: 0.36, dampingFraction: 0.88)) {
            expandedAgentID = expandedAgentID == id ? nil : id
        }
    }
}

private struct TaskWorkerRow: View {
    let agent: WorkerPresentation
    let isExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onToggle) {
                HStack(spacing: 8) {
                    WorkerMark(provider: agent.work.provider, size: 18)
                    Text(agent.work.title)
                        .font(.subheadline)
                        .foregroundStyle(HausPlatformColor.ink)
                        .lineLimit(1)
                    Text(agent.runStatusText)
                        .font(.footnote)
                        .foregroundStyle(statusColor)
                        .lineLimit(1)
                        .layoutPriority(1)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(HausPlatformColor.faintInk)
                        .rotationEffect(.degrees(isExpanded ? 180 : 0))
                        .accessibilityHidden(true)
                }
                .frame(minHeight: 36)
                .contentShape(Rectangle())
            }
            .buttonStyle(.pressableRow(cornerRadius: HausRadius.medium))
            .accessibilityElement(children: .combine)
            .accessibilityHint(isExpanded ? "Hides the cloud agent card" : "Shows the cloud agent card")

            if isExpanded {
                WorkerCard(agent: agent)
                    .transition(.opacity)
            }
        }
    }

    private var statusColor: Color {
        switch agent.newestRun?.status ?? agent.work.status {
        case .pendingInput: WorkerTone.warning
        case .failed: .red
        case .running, .queued: .accentColor
        case .completed, .cancelled, .expired: .secondary
        }
    }
}

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
        HStack(spacing: 8) {
            HausIcon(.pullRequest, size: 16, weight: 1.8)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .frame(width: 18)
                .accessibilityHidden(true)
            Text(pullRequest.title)
                .font(.subheadline)
                .foregroundStyle(HausPlatformColor.ink)
                .lineLimit(1)
            Text(pullRequest.stateLabel)
                .font(.footnote)
                .foregroundStyle(HausPlatformColor.mutedInk)
                .lineLimit(1)
                .layoutPriority(1)
            Spacer(minLength: 0)
        }
        .frame(minHeight: 36)
        .contentShape(Rectangle())
        .accessibilityValue(pullRequest.facts)
        .accessibilityElement(children: .combine)
    }
}
