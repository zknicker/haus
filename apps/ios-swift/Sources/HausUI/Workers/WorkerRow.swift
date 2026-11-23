import SwiftUI

/// A Worker in a Work list: a 60pt plain row with the status glyph leading,
/// the title, and a muted line that shimmers while the Worker runs. The list
/// owns the side margins.
public struct WorkerRow: View {
    private let presentation: WorkerRowPresentation
    private let open: () -> Void

    @ScaledMetric(relativeTo: .body) private var glyphSide: CGFloat = 14

    public init(_ presentation: WorkerRowPresentation, open: @escaping () -> Void) {
        self.presentation = presentation
        self.open = open
    }

    public var body: some View {
        Button(action: open) {
            HStack(alignment: .top, spacing: 14) {
                WorkerStatusMark(glyph: presentation.glyph, side: glyphSide)
                    .padding(.top, 4)
                VStack(alignment: .leading, spacing: 3) {
                    Text(presentation.title)
                        .font(.system(size: 17))
                        .foregroundStyle(HausPlatformColor.ink)
                        .lineLimit(1)
                    Text(presentation.subtitle)
                        .font(.system(size: 15))
                        .foregroundStyle(HausPlatformColor.mutedInk)
                        .lineLimit(1)
                        .workerShimmer(presentation.isLive)
                }
                Spacer(minLength: 0)
            }
            .padding(.vertical, 8)
            .frame(minHeight: 60, alignment: .top)
            .contentShape(.rect)
        }
        .buttonStyle(.pressableRow)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(presentation.title), \(presentation.subtitle)")
    }
}

/// A Worker's status glyph: a dot grid while it runs, then a check, a
/// question mark, a cross, or a stop square.
struct WorkerStatusMark: View {
    let glyph: WorkerRowPresentation.Glyph
    let side: CGFloat

    var body: some View {
        Group {
            switch glyph {
            case .working:
                DotGrid(dot: side * 3.2 / 24, gap: side * 2.8 / 24)
                    .foregroundStyle(HausPlatformColor.mutedInk)
            case .finished:
                symbol("checkmark", tint: HausPlatformColor.mutedInk)
            case .needsYou:
                symbol("questionmark", tint: HausPlatformColor.caution)
            case .failed:
                symbol("xmark", tint: HausPlatformColor.critical)
            case .stopped:
                symbol("stop", tint: HausPlatformColor.mutedInk)
            }
        }
        .frame(width: side, height: side)
    }

    private func symbol(_ name: String, tint: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: side * 0.85, weight: .semibold))
            .foregroundStyle(tint)
            .accessibilityHidden(true)
    }
}
