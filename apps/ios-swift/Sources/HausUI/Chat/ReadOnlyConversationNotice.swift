import SwiftUI

/// What stands where a read-only conversation's composer would be.
///
/// A conversation that was archived, or a DM whose peer Agent was retired,
/// stays readable and stops taking Messages (`ChatSummary.isReadOnly`). The
/// App replaces its composer with one line saying so rather than offering a
/// field that cannot send, and the phone says the same thing in the same
/// place. It is a statement, not a control: nothing here is pressable and
/// nothing takes a tab stop.
struct ReadOnlyConversationNotice: View {
    var body: some View {
        Text("This conversation is read-only. You can read it, but you can’t reply.")
            .font(.footnote)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 24)
            .padding(.top, 4)
            .padding(.bottom, 8)
    }
}

#Preview("Read-only notice") {
    ReadOnlyConversationNotice()
}
