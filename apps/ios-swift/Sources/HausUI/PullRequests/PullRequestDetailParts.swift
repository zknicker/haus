import SwiftUI

/// The author's mark and Worker, then when Haus last read the pull request.
struct PullRequestAuthorLine: View {
    let pullRequest: PullRequestPresentation
    let now: Date

    var body: some View {
        HStack(spacing: 8) {
            if let author = pullRequest.context.author {
                CaptainMark(name: author.captainName, tint: author.tint, side: 20)
                Text(author.workerLabel)
                    .foregroundStyle(HausPlatformColor.ink)
            }
            if let readAt = pullRequest.readAt {
                Text("read \(HausCompactRelativeTime.label(for: readAt, now: now)) ago")
                    .foregroundStyle(HausPlatformColor.mutedInk)
            }
        }
        .hausFont(.workRowMeta)
        .lineLimit(1)
    }
}

/// The facts box: state and review, the branch (tap to copy), then the
/// diffstat and changed files.
struct PullRequestFactsBox: View {
    let pullRequest: PullRequestPresentation
    let onCopyBranch: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                PullRequestTag {
                    HausIcon(.pullRequest, size: 14, weight: 1.8)
                        .foregroundStyle(pullRequest.tone.color)
                    Text(pullRequest.stateLabel)
                }
                if let review = pullRequest.reviewLabel {
                    PullRequestTag {
                        if pullRequest.reading.review == "approved" {
                            Image(systemName: "checkmark")
                                .foregroundStyle(HausPlatformColor.positive)
                        }
                        Text(review)
                    }
                }
            }
            if let branch = pullRequest.branchText, let head = pullRequest.context.headBranch {
                Button {
                    onCopyBranch(head)
                } label: {
                    PullRequestTag {
                        Image(systemName: "arrow.triangle.branch")
                            .foregroundStyle(HausPlatformColor.mutedInk)
                        Text(branch)
                            .truncationMode(.middle)
                    }
                }
                .buttonStyle(.pressable)
                .accessibilityHint("Copies the branch name")
            }
            HStack(spacing: 8) {
                if let diffstat = pullRequest.diffstat {
                    PullRequestTag {
                        PullRequestDiffstatText(diffstat: diffstat).text
                            .monospacedDigit()
                    }
                }
                PullRequestTag {
                    Text(pullRequest.filesText)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(12)
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .strokeBorder(HausPlatformColor.hairline, lineWidth: 1)
        }
    }
}

/// A 26pt fact plate on the fill.
struct PullRequestTag<Content: View>: View {
    @ViewBuilder let content: () -> Content

    @ScaledMetric(relativeTo: .subheadline) private var height: CGFloat = 26

    var body: some View {
        HStack(spacing: 6) {
            content()
        }
        .hausFont(.workRowMeta)
        .foregroundStyle(HausPlatformColor.ink)
        .lineLimit(1)
        .padding(.horizontal, 9)
        .frame(height: height)
        .background(HausPlatformColor.fill, in: .rect(cornerRadius: 8, style: .continuous))
    }
}

/// The checks rollup. A count per check waits on a Server read.
struct PullRequestChecksRow: View {
    let pullRequest: PullRequestPresentation

    var body: some View {
        HStack(spacing: 6) {
            Text("Checks")
            Spacer(minLength: 8)
            Image(systemName: pullRequest.checksSymbol)
                .font(.system(size: 12, weight: .semibold))
                .foregroundStyle(pullRequest.checksTone.color)
            Text(pullRequest.checksLabel)
        }
        .hausFont(.workRowMeta)
        .foregroundStyle(HausPlatformColor.mutedInk)
        .accessibilityElement(children: .combine)
    }
}

/// The Task and the Worker report the pull request came from.
struct PullRequestFromSection: View {
    let pullRequest: PullRequestPresentation
    let actions: PullRequestDetailActions

    var body: some View {
        let context = pullRequest.context
        if context.task != nil || context.worker != nil {
            WorkListSection("From", count: nil) {
                if let task = context.task {
                    Button {
                        actions.openTask(task)
                    } label: {
                        WorkListRow(title: task.title) {
                            TaskStateDisc(state: task.state, size: 18, surface: HausPlatformColor.canvas)
                        } meta: {
                            WorkMetaLine(pieces: [task.key, pullRequest.repositoryName])
                        }
                    }
                    .buttonStyle(.pressableRow)
                }
                if let worker = context.worker {
                    Button {
                        actions.openWorker(worker)
                    } label: {
                        WorkListRow(title: "Worker report") {
                            DotGrid(dot: 2.5, gap: 2)
                                .foregroundStyle(HausPlatformColor.mutedInk)
                        } meta: {
                            Text(worker.summary)
                        }
                    }
                    .buttonStyle(.pressableRow)
                }
            }
        }
    }
}
