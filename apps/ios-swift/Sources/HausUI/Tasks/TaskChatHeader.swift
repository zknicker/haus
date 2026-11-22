import HausModels
import SwiftUI

struct TaskChatHeader: View {
    let header: TaskChatHeaderPresentation
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
        .background(.bar)
        .overlay(alignment: .bottom) { Divider() }
    }

    private var content: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
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
                TaskWorkerRow(
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

private struct TaskWorkerRow: View {
    let agent: WorkerPresentation
    let isExpanded: Bool
    let onToggle: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button(action: onToggle) {
                HStack(alignment: .top, spacing: 10) {
                    WorkerMark(provider: agent.work.provider, size: 28)
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
