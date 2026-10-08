import SwiftUI

/// What Try Again and Delete do for a failed row. Rows live in hosted cells
/// with no environment, so the App installs these once at its root, the way
/// it installs `InAppReferenceRoutes`. Nothing installed (previews) means the
/// actions do nothing.
@MainActor
public enum FailedSendRoutes {
    public static var retry: ((_ messageID: String) -> Void)?
    public static var delete: ((_ messageID: String) -> Void)?
}

/// The caption under the viewer's own row while it is not yet durable:
/// "Sending" with a spinner, or "Not sent" in red once the send failed.
struct PendingSendCaption: View {
    let isFailed: Bool
    var spinnerSize: ControlSize = .mini

    var body: some View {
        HStack(spacing: 5) {
            if isFailed {
                Text("Not sent")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.red)
            } else {
                ProgressView().controlSize(spinnerSize)
                Text("Sending")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 2)
        .accessibilityHidden(true)
    }
}

extension View {
    /// The iMessage treatment for a failed send: a red exclamation beside the
    /// row and the whole row a tap target for Try Again or Delete Message. The
    /// row's accessibility element reads "Not sent" and carries the same two
    /// actions (`messageRowAccessibility`). A row that is not failed is unchanged.
    func failedSendControls(_ message: MessagePresentation) -> some View {
        modifier(FailedSendControls(messageID: message.id, isFailed: message.isSendFailed))
    }
}

private struct FailedSendControls: ViewModifier {
    let messageID: String
    let isFailed: Bool

    @State private var isAsking = false

    func body(content: Content) -> some View {
        if isFailed {
            content
                .padding(.trailing, 30)
                .overlay(alignment: .trailing) {
                    Image(systemName: "exclamationmark.circle.fill")
                        .font(.title3)
                        .foregroundStyle(.red)
                        .accessibilityHidden(true)
                }
                .contentShape(.rect)
                .onTapGesture { isAsking = true }
                .confirmationDialog(
                    "Your message was not sent.",
                    isPresented: $isAsking,
                    titleVisibility: .visible
                ) {
                    Button("Try Again") { FailedSendRoutes.retry?(messageID) }
                    Button("Delete Message", role: .destructive) { FailedSendRoutes.delete?(messageID) }
                }
        } else {
            content
        }
    }
}
