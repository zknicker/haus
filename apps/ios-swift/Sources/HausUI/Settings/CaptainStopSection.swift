import SwiftUI

/// Stop on a Captain's profile: one row that reads Stop while a turn runs,
/// then "Stopping…" until the turn settles, then "Stopped". Nothing shows
/// for a Captain the viewer cannot stop or one that is idle.
struct CaptainStopSection: View {
    let agentID: String
    let name: String

    @Environment(\.captainStop) private var captainStop
    @State private var stopTarget: CaptainStopTarget?

    var body: some View {
        if let phase = captainStop?.phase(agentID) {
            let isActionable = CaptainStopCopy.isActionable(phase)
            SettingsSection(nil) {
                SettingsListGroup {
                    Button { stopTarget = CaptainStopTarget(id: agentID, name: name) } label: {
                        HStack(spacing: 8) {
                            Text(CaptainStopCopy.title(phase))
                                .font(.body)
                                .foregroundStyle(isActionable ? HausPlatformColor.critical : HausPlatformColor.mutedInk)
                            Spacer(minLength: 8)
                            if phase == .stopping {
                                ProgressView().controlSize(.small)
                            }
                        }
                        .padding(.vertical, 10)
                        .frame(minHeight: 52)
                        .padding(.horizontal, SettingsCardMetrics.leadingInset)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(!isActionable)
                    .accessibilityLabel(CaptainStopCopy.title(phase))
                }
            }
            .captainStopConfirmation($stopTarget)
        }
    }
}

/// The same Stop row as a `List` section, for the read-only profile the
/// Chat details sheet pushes to.
struct CaptainStopListSection: View {
    let agentID: String
    let name: String

    @Environment(\.captainStop) private var captainStop
    @State private var stopTarget: CaptainStopTarget?

    var body: some View {
        if let phase = captainStop?.phase(agentID) {
            let isActionable = CaptainStopCopy.isActionable(phase)
            Section {
                Button(role: isActionable ? .destructive : nil) {
                    stopTarget = CaptainStopTarget(id: agentID, name: name)
                } label: {
                    Label(CaptainStopCopy.title(phase), systemImage: CaptainStopCopy.systemImage(phase))
                }
                .disabled(!isActionable)
            }
            .captainStopConfirmation($stopTarget)
        }
    }
}
