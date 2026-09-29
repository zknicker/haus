import SwiftUI

/// Ends the viewer's session. The owner signs out and clears app-local state;
/// a thrown error means the viewer is still signed in.
public typealias SettingsSignOut = @MainActor () async throws -> Void

/// The Settings root's last group: one red, icon-less Sign Out row behind a
/// confirmation, standing alone so it never reads as part of a preference group.
struct SettingsSignOutSection: View {
    let signOut: SettingsSignOut

    @State private var isConfirming = false
    @State private var isSigningOut = false
    @State private var failure: String?

    var body: some View {
        SettingsSection(nil) {
            SettingsListGroup {
                Button { isConfirming = true } label: {
                    HStack(spacing: 8) {
                        Text("Sign Out")
                            .font(.body)
                            .foregroundStyle(.red)
                        Spacer(minLength: 8)
                        if isSigningOut {
                            ProgressView().controlSize(.small)
                        }
                    }
                    .padding(.vertical, 10)
                    .frame(minHeight: 52)
                    .padding(.horizontal, 16)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(isSigningOut)
            }
        }
        .confirmationDialog(
            "Sign out of Haus?",
            isPresented: $isConfirming,
            titleVisibility: .visible
        ) {
            Button("Sign Out", role: .destructive, action: confirm)
            Button("Cancel", role: .cancel) {}
        }
        .alert(
            "Couldn't sign out",
            isPresented: Binding(
                get: { failure != nil },
                set: { if !$0 { failure = nil } }
            )
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }

    private func confirm() {
        Task { @MainActor in
            isSigningOut = true
            defer { isSigningOut = false }
            do {
                try await signOut()
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}
