import SwiftUI

/// The pull requests and files a report cited, as small plates under it.
struct WorkerCitationChips: View {
    let pullRequests: [WorkerCitedPullRequest]
    let files: [String]
    let openPullRequest: (WorkerCitedPullRequest) -> Void
    let openFile: (String) -> Void

    var body: some View {
        FlowLayout(spacing: 8) {
            ForEach(pullRequests) { pullRequest in
                chip(
                    label: pullRequest.label,
                    icon: .pullRequest,
                    tint: Self.tint(pullRequest.state),
                    accessibility: "Pull request \(pullRequest.label)"
                ) { openPullRequest(pullRequest) }
            }
            ForEach(files, id: \.self) { path in
                let name = WorkerStepGroup.displayLabel(path, kind: .read)
                chip(label: name, icon: .document, tint: HausPlatformColor.mutedInk, accessibility: "File \(name)") {
                    openFile(path)
                }
            }
        }
    }

    private func chip(
        label: String,
        icon: HausIconName,
        tint: Color,
        accessibility: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 6) {
                HausIcon(icon, size: 14, weight: 1.8)
                    .foregroundStyle(tint)
                Text(label)
                    .font(.subheadline)
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
            }
            .padding(.horizontal, 8)
            .frame(minHeight: 26)
            .background(HausPlatformColor.fill, in: .rect(cornerRadius: 7))
            .contentShape(.rect(cornerRadius: 7))
        }
        .buttonStyle(.pressable)
        .accessibilityLabel(accessibility)
    }

    static func tint(_ state: WorkerCitedPullRequest.State) -> Color {
        switch state {
        case .open: HausPlatformColor.positive
        case .draft: HausPlatformColor.caution
        case .merged: HausPlatformColor.accentInk
        case .closed: HausPlatformColor.critical
        case .unknown: HausPlatformColor.mutedInk
        }
    }
}

/// Lays its children out in rows, wrapping at the proposed width.
private struct FlowLayout: Layout {
    let spacing: CGFloat

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = rows(width: proposal.width ?? .infinity, subviews: subviews)
        let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for row in rows(width: bounds.width, subviews: subviews) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
            y += row.height + spacing
        }
    }

    private struct Row {
        var indices: [Int] = []
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func rows(width: CGFloat, subviews: Subviews) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            let next = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            if !row.indices.isEmpty, next > width {
                rows.append(row)
                row = Row()
            }
            row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}
