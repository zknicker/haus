import Foundation
import HausModels

/// The Server side of message pushes: which devices this signed-in human
/// reaches. Neither call is Server-scoped; a device belongs to the account.
extension HausStore {
    func registerPushDevice(token: String, environment: PushEnvironment) async {
        do {
            let _: PushDeviceResult = try await client.mutation(
                "push.registerDevice",
                input: RegisterPushDeviceInput(
                    token: token,
                    environment: environment,
                    bundleId: Bundle.main.bundleIdentifier ?? "chat.haus.ios"
                )
            )
        } catch {
            Self.logger.error("Registering for push failed: \(error.localizedDescription, privacy: .public)")
        }
    }

    /// False when the Server did not hear it; the caller keeps the intent and retries.
    @discardableResult
    func unregisterPushDevice(token: String) async -> Bool {
        do {
            let _: PushDeviceResult = try await client.mutation(
                "push.unregisterDevice",
                input: UnregisterPushDeviceInput(token: token)
            )
            return true
        } catch {
            Self.logger.error("Unregistering push failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
}
