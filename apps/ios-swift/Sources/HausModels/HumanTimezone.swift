import Foundation

/// A human's timezone preference as the Server stores it: a canonical IANA
/// name (`packages/haus-api/src/timezone.ts`). Offsets carry no DST rule, so
/// the Server refuses them; the phone filters the same way before it reports
/// the device zone, so a zone the Server would refuse never fails the identity
/// sync it rides on.
public enum HumanTimezone {
    /// The device zone, or nil when the Server would refuse it.
    public static func deviceZone(_ identifier: String = TimeZone.current.identifier) -> String? {
        isAcceptable(identifier) ? identifier : nil
    }

    /// The zone a viewer reads times in: their saved Profile zone, else the
    /// device zone while the saved one is blank or unknown to the platform.
    public static func viewerZone(saved: String?, device: TimeZone = .current) -> TimeZone {
        saved.flatMap { TimeZone(identifier: $0) } ?? device
    }

    /// An IANA-shaped name (`Region/City`, `UTC`) the platform also knows.
    public static func isAcceptable(_ identifier: String) -> Bool {
        let parts = identifier.split(separator: "/", omittingEmptySubsequences: false)
        guard let head = parts.first, let first = head.first, first.isASCII, first.isLetter,
              head.allSatisfy({ $0.isASCII && ($0.isLetter || $0 == "_") }),
              parts.dropFirst().allSatisfy({ part in
                  !part.isEmpty && part.allSatisfy { $0.isASCII && ($0.isLetter || $0.isNumber || "_+-".contains($0)) }
              }),
              identifier.count <= 64 else { return false }
        return TimeZone(identifier: identifier) != nil
    }

    /// Every zone the platform knows, plus UTC and the current value, sorted.
    public static func options(current: String?) -> [String] {
        var zones = Set(TimeZone.knownTimeZoneIdentifiers.filter(isAcceptable))
        zones.insert("UTC")
        if let current { zones.insert(current) }
        return zones.sorted()
    }

    /// `America/New_York` reads as "America/New York".
    public static func label(_ identifier: String) -> String {
        identifier.replacingOccurrences(of: "_", with: " ")
    }

    /// The picker's search: `New_York` and `new york` both find `America/New York`.
    public static func matches(_ identifier: String, query: String) -> Bool {
        let needle = label(query).trimmingCharacters(in: .whitespaces).lowercased()
        return needle.isEmpty || label(identifier).lowercased().contains(needle)
    }
}
