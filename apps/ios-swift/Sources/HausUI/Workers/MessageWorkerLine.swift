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
                    Text("\(Text(row.title).foregroundStyle(HausPlatformColor.ink)) · \(row.subtitle)")
                        .foregroundStyle(HausPlatformColor.mutedInk)
                        .font(.subheadline)
                        .lineLimit(1)
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
