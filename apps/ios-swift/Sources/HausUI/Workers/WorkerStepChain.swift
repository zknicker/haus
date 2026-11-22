import SwiftUI

/// A turn's steps as folded lines. A finished line opens to its steps; the
/// live turn's current step is bright and shimmers.
struct WorkerStepChain: View {
    let groups: [WorkerStepGroup]

    @State private var expanded: Set<Int> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            ForEach(groups) { group in
                if group.isCurrent {
                    currentLine(group)
                } else {
                    foldedLine(group)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func currentLine(_ group: WorkerStepGroup) -> some View {
        let verb = Text(group.verb).foregroundStyle(HausPlatformColor.mutedInk)
        let subject = Text(group.subject).foregroundStyle(HausPlatformColor.ink)
        return Text("\(verb) \(subject)")
            .font(.body)
            .lineLimit(1)
            .truncationMode(.middle)
            .workerShimmer(true)
            .accessibilityLabel(group.title)
    }

    private func foldedLine(_ group: WorkerStepGroup) -> some View {
        let isOpen = expanded.contains(group.id)
        return VStack(alignment: .leading, spacing: 8) {
            Button {
                withAnimation(.snappy(duration: 0.22)) {
                    if isOpen { expanded.remove(group.id) } else { expanded.insert(group.id) }
                }
            } label: {
                HStack(spacing: 6) {
                    Text(group.title)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.semibold))
                        .rotationEffect(.degrees(isOpen ? 90 : 0))
                        .accessibilityHidden(true)
                }
                .font(.body)
                .foregroundStyle(group.failed ? HausPlatformColor.critical : HausPlatformColor.mutedInk)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .accessibilityValue(isOpen ? "Expanded" : "Collapsed")

            if isOpen {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(Array(group.steps.enumerated()), id: \.offset) { _, step in
                        WorkerStepDetail(step: step)
                    }
                }
                .padding(.leading, 12)
                .transition(.opacity)
            }
        }
    }
}

/// One step inside an opened line: its full path or command, its line
/// counts, and a run's output tail.
private struct WorkerStepDetail: View {
    let step: WorkerStepEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                Text(step.label)
                    .foregroundStyle(step.state == .failed ? HausPlatformColor.critical : HausPlatformColor.mutedInk)
                    .lineLimit(2)
                    .truncationMode(.middle)
                if let additions = step.additions, additions > 0 {
                    Text("+\(additions)").foregroundStyle(HausPlatformColor.positive)
                }
                if let deletions = step.deletions, deletions > 0 {
                    Text("−\(deletions)").foregroundStyle(HausPlatformColor.critical)
                }
            }
            .font(.subheadline)

            if let output = step.output, !output.isEmpty {
                Text(output)
                    .font(.caption.monospaced())
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .lineLimit(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(10)
                    .background(HausPlatformColor.fill, in: .rect(cornerRadius: 10))
                    .textSelection(.enabled)
            }
        }
    }
}
