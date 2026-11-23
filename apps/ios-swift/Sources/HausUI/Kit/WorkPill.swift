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
                if count > 0 {
                    Text(count, format: .number)
                        .monospacedDigit()
                        .hausFont(.workPill)
                        .foregroundStyle(HausPlatformColor.ink)
                }
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
        .accessibilityValue(count > 0 ? Text(count, format: .number) : Text(""))
    }
}

/// The Work pill floated centered above a place's composer, or nothing while
/// the place has no work to show.
struct WorkPillSlot: View {
    let state: WorkPillState?
    let open: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            if let state, state.isVisible {
                WorkPill(count: state.count, action: open)
                    .frame(maxWidth: .infinity)
                    .padding(.bottom, 10)
                    .transition(.opacity.combined(with: .scale(scale: 0.9)))
            }
        }
        .animation(.easeOut(duration: 0.2), value: state?.isVisible)
    }
}
