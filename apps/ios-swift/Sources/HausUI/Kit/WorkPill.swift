import SwiftUI

/// The floating glass pill centered above a place's composer: the work glyph,
/// how much work the place holds, and a chevron that opens it.
struct WorkPill: View {
    private let count: Int
    private let action: () -> Void

    @ScaledMetric(relativeTo: .subheadline) private var height: CGFloat = 36
    @ScaledMetric(relativeTo: .subheadline) private var glyphSide: CGFloat = 14

    init(count: Int, action: @escaping () -> Void) {
        self.count = count
        self.action = action
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                DotGrid(dot: glyphSide * 3.2 / 24, gap: glyphSide * 2.8 / 24)
                    .frame(width: glyphSide, height: glyphSide)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                Text(count, format: .number)
                    .monospacedDigit()
                    .hausFont(.workPill)
                    .foregroundStyle(HausPlatformColor.ink)
                Image(systemName: "chevron.up")
                    .hausFont(.workPillChevron)
                    .foregroundStyle(HausPlatformColor.mutedInk)
                    .accessibilityHidden(true)
            }
            .padding(.horizontal, 12)
            .frame(height: height)
            .contentShape(.capsule)
        }
        .buttonStyle(.plain)
        .glassEffect(.regular.interactive(), in: .capsule)
        .accessibilityLabel("Work")
        .accessibilityValue(Text(count, format: .number))
    }
}
