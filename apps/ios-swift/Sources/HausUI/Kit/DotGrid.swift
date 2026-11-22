import SwiftUI

/// A 3×3 grid of round dots in the foreground style: the Haus work glyph.
struct DotGrid: View {
    private let dot: CGFloat
    private let gap: CGFloat
    private let fadesAlternateDots: Bool

    /// - Parameter fadesAlternateDots: halves every other dot, the working
    ///   badge's texture.
    init(dot: CGFloat, gap: CGFloat, fadesAlternateDots: Bool = false) {
        self.dot = dot
        self.gap = gap
        self.fadesAlternateDots = fadesAlternateDots
    }

    var body: some View {
        VStack(spacing: gap) {
            ForEach(0..<3, id: \.self) { row in
                HStack(spacing: gap) {
                    ForEach(0..<3, id: \.self) { column in
                        Circle()
                            .frame(width: dot, height: dot)
                            .opacity(Self.opacity(at: row * 3 + column, fadesAlternateDots: fadesAlternateDots))
                    }
                }
            }
        }
        .accessibilityHidden(true)
    }

    nonisolated static func opacity(at index: Int, fadesAlternateDots: Bool) -> Double {
        fadesAlternateDots && !index.isMultiple(of: 2) ? 0.5 : 1
    }

    /// The grid's drawn side for a dot and gap.
    nonisolated static func side(dot: CGFloat, gap: CGFloat) -> CGFloat {
        dot * 3 + gap * 2
    }
}
