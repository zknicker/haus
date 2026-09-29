import Foundation

/// The APNs environment a device token belongs to. A token only works against
/// the gateway that issued it, so the Server must be told which one.
public enum PushEnvironment: String, Codable, Sendable, Equatable {
    case sandbox
    case production

    /// What the installed build's signature says about its APNs environment.
    ///
    /// The embedded provisioning profile is the ground truth, not the build
    /// configuration: a Release build installed from Xcode is still
    /// development-signed and gets sandbox tokens, while App Store and
    /// TestFlight installs carry no embedded profile at all because Apple
    /// strips it, and their tokens are production.
    public enum Signature: Sendable, Equatable {
        /// No `embedded.mobileprovision` in the bundle: an App Store or
        /// TestFlight install.
        case storeDistributed
        /// An embedded profile, with its `aps-environment` entitlement if it
        /// grants one.
        case provisioned(apsEnvironment: String?)
    }

    /// Simulator tokens always come from the sandbox gateway.
    public static func resolve(signature: Signature, isSimulator: Bool) -> PushEnvironment {
        if isSimulator { return .sandbox }
        switch signature {
        case .storeDistributed:
            return .production
        case .provisioned(let apsEnvironment):
            // Ad Hoc and Enterprise profiles say `production`; development
            // profiles say `development`. A profile without the entitlement
            // cannot register at all, so sandbox is only a harmless default.
            return apsEnvironment == "production" ? .production : .sandbox
        }
    }

    /// Reads a bundle's embedded profile. `nil` data means the file is absent.
    public static func signature(embeddedProfile data: Data?) -> Signature {
        guard let data else { return .storeDistributed }
        return .provisioned(apsEnvironment: ProvisioningProfile.apsEnvironment(data))
    }
}

/// `embedded.mobileprovision` is a CMS envelope around an XML property list;
/// the plist bytes sit in it verbatim, so they can be cut out without a CMS
/// decoder.
public enum ProvisioningProfile {
    public static func apsEnvironment(_ data: Data) -> String? {
        guard let start = data.range(of: Data("<?xml".utf8)),
              let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex)
        else { return nil }
        let plistData = data[start.lowerBound..<end.upperBound]
        guard let plist = try? PropertyListSerialization.propertyList(from: plistData, format: nil),
              let root = plist as? [String: Any],
              let entitlements = root["Entitlements"] as? [String: Any]
        else { return nil }
        return entitlements["aps-environment"] as? String
    }
}

/// APNs device tokens travel as lowercase hex, the form the Server stores and
/// the APNs HTTP/2 API addresses.
public enum PushDeviceToken {
    public static func hex(_ token: Data) -> String {
        token.map { byte in
            let hex = String(byte, radix: 16)
            return byte < 0x10 ? "0" + hex : hex
        }
        .joined()
    }
}

/// Input for `push.registerDevice`.
public struct RegisterPushDeviceInput: Encodable, Sendable, Equatable {
    public let token: String
    public let environment: PushEnvironment
    public let bundleId: String

    public init(token: String, environment: PushEnvironment, bundleId: String) {
        self.token = token
        self.environment = environment
        self.bundleId = bundleId
    }
}

/// Input for `push.unregisterDevice`.
public struct UnregisterPushDeviceInput: Encodable, Sendable, Equatable {
    public let token: String

    public init(token: String) {
        self.token = token
    }
}

/// `push.registerDevice` and `push.unregisterDevice` both answer `{ ok: true }`.
public struct PushDeviceResult: Decodable, Sendable, Equatable {
    public let ok: Bool
}
