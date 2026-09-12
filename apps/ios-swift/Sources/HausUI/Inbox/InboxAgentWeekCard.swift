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

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    AvatarView(
                        name: week.name,
                        url: week.avatarURL,
                        presence: week.presence,
                        size: inboxMarkSize
                    )
                    Text(week.name)
                        .font(.subheadline.weight(.medium))
                        .lineLimit(1)
                }

                HStack(alignment: .bottom, spacing: 8) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(InboxTokens.format(week.totalTokens))
                            .font(.title2.weight(.semibold))
                            .monospacedDigit()
                        Text(week.unit)
                            .font(.caption)
                            .foregroundStyle(week.isLive ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    InboxSparkline(values: week.days)
                        .foregroundStyle(week.isLive ? AnyShapeStyle(.tint) : AnyShapeStyle(.secondary))
                        .frame(width: 64, height: 20)
                }
            }
            .padding(14)
            .frame(width: 196, alignment: .leading)
            .background(
                HausPlatformColor.groupedSurface,
                in: .rect(cornerRadius: InboxMetrics.boxRadius)
            )
            .overlay(
                RoundedRectangle(cornerRadius: InboxMetrics.boxRadius)
                    .strokeBorder(Color.primary.opacity(0.07))
            )
            .contentShape(Rectangle())
        }
        .buttonStyle(.pressable)
        .foregroundStyle(HausPlatformColor.label)
        .accessibilityLabel("\(week.name), \(InboxTokens.format(week.totalTokens)) \(week.unit)")
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
            let points = Self.points(values, in: proxy.size)
            if points.count >= 2 {
                ZStack {
                    if !isFlat {
                        area(points, height: proxy.size.height)
                            .fill(.foreground.opacity(0.16))
                    }
                    line(points)
                        .stroke(
                            .foreground.opacity(isFlat ? 0.3 : 0.85),
                            style: StrokeStyle(lineWidth: 1.25, lineCap: .round, lineJoin: .round)
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

    static func points(_ values: [Int], in size: CGSize) -> [CGPoint] {
        guard values.count >= 2 else { return [] }
        let peak = CGFloat(max(values.max() ?? 0, 1))
        let step = size.width / CGFloat(values.count - 1)
        return values.enumerated().map { index, value in
            CGPoint(
                x: CGFloat(index) * step,
                y: size.height - (CGFloat(value) / peak) * size.height
            )
        }
    }
}
