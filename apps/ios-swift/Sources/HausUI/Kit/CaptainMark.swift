import SwiftUI

/// A Captain's squircle avatar at any side, with an optional working badge and
/// unread dot. People keep their circular avatars; only Captains are squircles.
struct CaptainMark<Face: View>: View {
    private let name: String
    private let geometry: CaptainMarkGeometry
    private let isWorking: Bool
    private let isUnread: Bool
    private let face: Face

    init(
        name: String,
        side: CGFloat,
        isWorking: Bool = false,
        isUnread: Bool = false,
        @ViewBuilder face: () -> Face
    ) {
        self.name = name
        self.geometry = CaptainMarkGeometry(side: side)
        self.isWorking = isWorking
        self.isUnread = isUnread
        self.face = face()
    }

    var body: some View {
        face
            .frame(width: geometry.side, height: geometry.side)
            .overlay(alignment: .bottomTrailing) {
                if isWorking {
                    CaptainWorkingBadge(geometry: geometry)
                }
            }
            .clipShape(.haus(geometry.cornerRadius))
            .overlay(alignment: .topTrailing) {
                if isUnread {
                    CaptainUnreadDot(geometry: geometry)
                        .offset(x: geometry.unreadOverhang, y: -geometry.unreadOverhang)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(name)
            .accessibilityValue(accessibilityState)
    }

    private var accessibilityState: String {
        [isWorking ? "Working" : nil, isUnread ? "Unread" : nil]
            .compactMap { $0 }
            .joined(separator: ", ")
    }
}

extension CaptainMark where Face == CaptainMonogram {
    /// A mark drawn as the Captain's initial on a gradient of its tint.
    init(
        name: String,
        tint: Color,
        side: CGFloat,
        isWorking: Bool = false,
        isUnread: Bool = false
    ) {
        let geometry = CaptainMarkGeometry(side: side)
        self.init(name: name, side: side, isWorking: isWorking, isUnread: isUnread) {
            CaptainMonogram(
                initial: CaptainMonogram.initial(of: name),
                tint: tint,
                fontSize: geometry.initialSize
            )
        }
    }
}

/// A Captain's initial in white on a top-to-bottom gradient of its tint.
struct CaptainMonogram: View {
    let initial: String
    let tint: Color
    let fontSize: CGFloat

    var body: some View {
        LinearGradient(
            colors: [tint, tint.mix(with: .black, by: 0.25)],
            startPoint: UnitPoint(x: 0.33, y: 0),
            endPoint: UnitPoint(x: 0.67, y: 1)
        )
        .overlay {
            Text(initial)
                .font(HausFont.font(size: fontSize, weight: .semibold))
                .foregroundStyle(.white)
        }
    }

    nonisolated static func initial(of name: String) -> String {
        name.trimmingCharacters(in: .whitespacesAndNewlines).first.map { String($0).uppercased() } ?? ""
    }
}

private struct CaptainWorkingBadge: View {
    let geometry: CaptainMarkGeometry

    private static let ground = HausTone(HausSwatch(0x1B1B1D))
    private static let dots = HausTone(HausSwatch(0x9A9A9E))

    var body: some View {
        UnevenRoundedRectangle(
            topLeadingRadius: geometry.badgeCornerRadius,
            style: .continuous
        )
        .fill(Self.ground.color)
        .frame(width: geometry.badgeSide, height: geometry.badgeSide)
        .overlay {
            DotGrid(dot: geometry.badgeDot, gap: geometry.badgeDotGap, fadesAlternateDots: true)
                .foregroundStyle(Self.dots.color)
        }
    }
}

private struct CaptainUnreadDot: View {
    let geometry: CaptainMarkGeometry

    var body: some View {
        Circle()
            .fill(HausPlatformColor.canvas)
            .frame(width: geometry.unreadDiameter, height: geometry.unreadDiameter)
            .overlay {
                Circle()
                    .fill(HausPlatformColor.accent)
                    .padding(geometry.unreadRing)
            }
    }
}
