import SwiftUI
import HausModels

/// The Cloud Agent job's one point of lifecycle color: the native
/// indeterminate spinner while it works, a check disc once done, and a cross
/// disc for any other ending. A working job has no progress fraction to show,
/// so the spinner never pretends to one.
struct CloudAgentStatusGlyph: View {
    let state: CloudAgentJobState
    var size: CGFloat = 15

    var body: some View {
        Group {
            if state == .working {
                ProgressView()
                    .progressViewStyle(.circular)
                    .controlSize(.mini)
                    .tint(tint)
            } else {
                Image(systemName: Self.symbol(for: state))
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(tint)
            }
        }
        // One box for every state, so a settling job never shifts its line.
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }

    private static func symbol(for state: CloudAgentJobState) -> String {
        switch state {
        case .done: "checkmark.circle.fill"
        case .pendingInput: "questionmark.circle.fill"
        default: "xmark.circle.fill"
        }
    }

    private var tint: Color { CloudAgentTone.color(for: state) }
}

/// The lifecycle colors a Cloud Agent surface may use, from the App's one tone
/// rule: accent while working, success when done, danger when failed, muted
/// once cancelled or expired, and warning for a quiet live Run or a question waiting for an answer.
enum CloudAgentTone {
    static let warning = Color.orange

    static func color(for state: CloudAgentJobState) -> Color {
        switch state {
        case .working: .accentColor
        case .done: .green
        case .failed: .red
        case .cancelled, .expired: .secondary
        case .pendingInput: warning
        }
    }

    static func color(for tone: CloudAgentStatusLine.Tone) -> Color {
        switch tone {
        case .muted: .secondary
        case .warning: warning
        case .danger: .red
        }
    }
}
