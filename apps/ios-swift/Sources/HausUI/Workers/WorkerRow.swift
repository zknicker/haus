import SwiftUI

/// A Worker in a Work list: a 60pt plain row with the status glyph leading,
/// the title, and a muted line that shimmers while the Worker runs.
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
                glyph
                    .frame(width: glyphSide, height: glyphSide)
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
            .padding(.horizontal, 20)
            .frame(minHeight: 60)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(presentation.title), \(presentation.subtitle)")
    }

    @ViewBuilder
    private var glyph: some View {
        switch presentation.glyph {
        case .working:
            DotGrid(dot: glyphSide * 3.2 / 24, gap: glyphSide * 2.8 / 24)
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

    private func symbol(_ name: String, tint: Color) -> some View {
        Image(systemName: name)
            .font(.system(size: glyphSide * 0.85, weight: .semibold))
            .foregroundStyle(tint)
            .accessibilityHidden(true)
    }
}
