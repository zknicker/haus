import SwiftUI

/// Where the Thread connector ends: the preview's ingress, and — when the
/// preview carries Cloud Agent cards — the point beside them it turns in at,
/// so the line keeps running down the left of the stack.
struct ThreadIngressAnchors {
    var ingress: Anchor<CGRect>?
    var stackElbow: Anchor<CGRect>?
}

struct ThreadIngressAnchor: PreferenceKey {
    static let defaultValue = ThreadIngressAnchors()
    static func reduce(value: inout ThreadIngressAnchors, nextValue: () -> ThreadIngressAnchors) {
        let next = nextValue()
        value.ingress = next.ingress ?? value.ingress
        value.stackElbow = next.stackElbow ?? value.stackElbow
    }
}

struct ThreadIngressConnector: View {
    let anchors: ThreadIngressAnchors
    let isContinuation: Bool

    var body: some View {
        GeometryReader { geometry in
            if let target = (anchors.stackElbow ?? anchors.ingress).map({ geometry[$0] }) {
                let endY = anchors.stackElbow == nil ? target.minY + 21 : target.midY
                Path { path in
                    path.move(to: CGPoint(x: 19, y: min(isContinuation ? 0 : 44, endY - 8)))
                    path.addLine(to: CGPoint(x: 19, y: endY - 8))
                    path.addQuadCurve(to: CGPoint(x: 27, y: endY), control: CGPoint(x: 19, y: endY))
                    path.addLine(to: CGPoint(x: target.minX - 6, y: endY))
                }
                .stroke(.tertiary, style: StrokeStyle(lineWidth: 1.5, lineCap: .round))
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
