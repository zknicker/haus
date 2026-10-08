import SwiftUI

/// One Agent's week as a card in the strip: its face and name on the header
/// line, then the tokens it processed this week and the shape they came in.
///
/// The figure leads and the series trails, which is the stat-card grammar the
/// rest of the system uses. A working Agent spends the line under the figure on
/// the step it is on, in accent, so a moving card reads as moving without a
/// second badge saying so.
struct InboxAgentWeekCard: View {
    let week: InboxAgentWeek
    let onOpen: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    /// At accessibility sizes the card stacks instead of truncating: the
    /// header and the series each take their own line, the caption may wrap,
    /// and the card widens so the figure still reads as one word.
    private var isStacked: Bool { dynamicTypeSize.isAccessibilitySize }

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 12) {
                header

                if isStacked {
                    VStack(alignment: .leading, spacing: 10) {
                        figure
                        sparkline.frame(maxWidth: .infinity)
                    }
                } else {
                    HStack(alignment: .bottom, spacing: 8) {
                        figure
                        Spacer(minLength: 0)
                        sparkline.frame(width: 64)
                    }
                }
            }
            // The trailing inset clears the corner's curve, which starts where
            // a radius-sized inset ends; the sparkline's last point sat on it.
            .padding(.vertical, 14)
            .padding(.leading, 14)
            .padding(.trailing, 18)
            .frame(width: isStacked ? 280 : 196, alignment: .leading)
            .background(
                HausPlatformColor.groupedSurface,
                in: .rect(cornerRadius: InboxMetrics.boxRadius, style: .continuous)
            )
            .overlay(
                RoundedRectangle.haus(InboxMetrics.boxRadius)
                    .strokeBorder(Color.primary.opacity(0.07))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .foregroundStyle(HausPlatformColor.label)
        .accessibilityLabel("\(week.name), \(InboxTokens.format(week.totalTokens)) \(week.unit)")
    }

    private var header: some View {
        let layout = isStacked
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 8))
            : AnyLayout(HStackLayout(spacing: 10))
        return layout {
            AvatarView(
                name: week.name,
                url: week.avatarURL,
                presence: week.presence,
                size: inboxMarkSize
            )
            Text(week.name)
                .font(.subheadline.weight(.medium))
                .lineLimit(isStacked ? 2 : 1)
        }
    }

    private var figure: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(InboxTokens.format(week.totalTokens))
                .font(.title2.weight(.semibold))
                .monospacedDigit()
                .lineLimit(1)
            Text(week.unit)
                .font(.caption)
                .foregroundStyle(liveStyle)
                .lineLimit(isStacked ? 3 : 1)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var sparkline: some View {
        InboxSparkline(values: week.days)
            .foregroundStyle(liveStyle)
            .frame(height: 20)
    }

    private var liveStyle: AnyShapeStyle {
        week.isLive ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary)
    }
}

/// A short series drawn at glyph size: a handful of numbers as one small
/// stroke. At this size the drawing is the primitive, so this is a path rather
/// than a chart. A series that never left zero states that plainly — one quiet
/// rule along the floor rather than an invented curve.
struct InboxSparkline: View {
    let values: [Int]

    var body: some View {
        GeometryReader { proxy in
            // Inset by the stroke so the round caps stay inside the frame.
            let points = Self.points(values, in: proxy.size, inset: Self.lineWidth / 2)
            if points.count >= 2 {
                ZStack {
                    if !isFlat {
                        area(points, height: proxy.size.height)
                            .fill(.foreground.opacity(0.16))
                    }
                    line(points)
                        .stroke(
                            .foreground.opacity(isFlat ? 0.3 : 0.85),
                            style: StrokeStyle(lineWidth: Self.lineWidth, lineCap: .round, lineJoin: .round)
                        )
                }
            }
        }
        .accessibilityHidden(true)
    }

    private var isFlat: Bool { (values.max() ?? 0) <= 0 }

    private func line(_ points: [CGPoint]) -> Path {
        var path = Path()
        path.addLines(points)
        return path
    }

    private func area(_ points: [CGPoint], height: CGFloat) -> Path {
        var path = Path()
        path.addLines(points)
        if let last = points.last, let first = points.first {
            path.addLine(to: CGPoint(x: last.x, y: height))
            path.addLine(to: CGPoint(x: first.x, y: height))
            path.closeSubpath()
        }
        return path
    }

    static let lineWidth: CGFloat = 1.25

    static func points(_ values: [Int], in size: CGSize, inset: CGFloat = 0) -> [CGPoint] {
        guard values.count >= 2 else { return [] }
        let width = max(0, size.width - inset * 2)
        let height = max(0, size.height - inset * 2)
        let peak = CGFloat(max(values.max() ?? 0, 1))
        let step = width / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            CGPoint(
                x: inset + CGFloat(index) * step,
                y: inset + height - (CGFloat(value) / peak) * height
            )
        }
    }
}
