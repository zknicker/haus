import SwiftUI

/// A Worker a message started, as one quiet line under it: the status glyph,
/// the title, and its state. Tapping it opens the Worker view. Transcript rows
/// inherit no custom environment, so the open goes through
/// `InAppReferenceRoutes`, the same table a `worker://` reference uses.
struct MessageWorkerLine: View {
    let worker: WorkerPresentation

    @ScaledMetric(relativeTo: .subheadline) private var glyphSide: CGFloat = 12

    var body: some View {
        TimelineView(.periodic(from: .now, by: 60)) { context in
            let row = WorkerRowPresentation(worker: worker.work, now: context.date)
            Button { InAppReferenceRoutes.openWorker?(worker.id) } label: {
                HStack(spacing: 8) {
                    WorkerStatusMark(glyph: row.glyph, side: glyphSide)
                    WorkerLineText(row: row)
                        .font(.subheadline)
                        .workerShimmer(row.isLive)
                }
                .frame(minHeight: 28)
                .contentShape(.rect)
            }
            .buttonStyle(.pressable)
            .accessibilityElement(children: .combine)
            .accessibilityLabel("\(row.title), \(row.subtitle)")
            .accessibilityHint("Opens the Worker")
        }
    }
}

/// The title and as much of the meta as fits on one line. Meta pieces drop
/// from the end, never cut mid-piece; when even the state does not fit beside
/// the full title, the title truncates and the state stays whole.
private struct WorkerLineText: View {
    let row: WorkerRowPresentation

    var body: some View {
        ViewThatFits(in: .horizontal) {
            ForEach(Array(stride(from: row.subtitleParts.count, through: 1, by: -1)), id: \.self) { count in
                line(meta: row.subtitleParts.prefix(count))
                    .fixedSize()
            }
            HStack(spacing: 0) {
                Text(row.title)
                    .foregroundStyle(HausPlatformColor.ink)
                    .lineLimit(1)
                if let state = row.subtitleParts.first {
                    Text(WorkerRowPresentation.separator + state)
                        .foregroundStyle(HausPlatformColor.mutedInk)
                        .lineLimit(1)
                        .fixedSize()
                }
            }
        }
    }

    private func line(meta: ArraySlice<String>) -> some View {
        Text("\(Text(row.title).foregroundStyle(HausPlatformColor.ink))\(WorkerRowPresentation.separator)\(meta.joined(separator: WorkerRowPresentation.separator))")
            .foregroundStyle(HausPlatformColor.mutedInk)
            .lineLimit(1)
    }
}
