import Foundation

/// Per-device seasonal offer records in `UserDefaults`, beside the icon they
/// describe. Keyed by season year so each offer shows at most once a season.
@MainActor
enum SeasonalIconOfferStore {
    static let halloweenOffersShownKey = "haus.appIcon.halloweenOffersShown"
    static let returnOffersShownKey = "haus.appIcon.halloweenReturnOffersShown"
    static let pumpkinFromOfferSeasonKey = "haus.appIcon.pumpkinFromOfferSeason"

    static func load() -> SeasonalIconRecords {
        let defaults = UserDefaults.standard
        return SeasonalIconRecords(
            halloweenOffersShown: years(defaults, halloweenOffersShownKey),
            returnOffersShown: years(defaults, returnOffersShownKey),
            pumpkinFromOfferSeason: defaults.object(forKey: pumpkinFromOfferSeasonKey) as? Int
        )
    }

    static func save(_ records: SeasonalIconRecords) {
        let defaults = UserDefaults.standard
        defaults.set(records.halloweenOffersShown.sorted(), forKey: halloweenOffersShownKey)
        defaults.set(records.returnOffersShown.sorted(), forKey: returnOffersShownKey)
        if let season = records.pumpkinFromOfferSeason {
            defaults.set(season, forKey: pumpkinFromOfferSeasonKey)
        } else {
            defaults.removeObject(forKey: pumpkinFromOfferSeasonKey)
        }
    }

    /// A Settings switch makes the icon the user's own choice again.
    static func forgetOfferSwitch() {
        UserDefaults.standard.removeObject(forKey: pumpkinFromOfferSeasonKey)
    }

    /// The date the offer rule reads. Debug builds take `-HausSeasonDate
    /// yyyy-MM-dd` from the launch arguments, and `-HausSeasonReset YES`
    /// clears the records once per launch; neither exists in Release.
    static func now() -> Date {
        #if DEBUG
        applyDebugResetOnce()
        let arguments = ProcessInfo.processInfo.arguments
        if let flag = arguments.firstIndex(of: "-HausSeasonDate"), arguments.indices.contains(flag + 1) {
            let formatter = DateFormatter()
            formatter.calendar = Calendar(identifier: .gregorian)
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = .current
            formatter.dateFormat = "yyyy-MM-dd"
            if let date = formatter.date(from: arguments[flag + 1]) { return date }
        }
        #endif
        return Date()
    }

    #if DEBUG
    private static var didApplyDebugReset = false

    private static func applyDebugResetOnce() {
        guard !didApplyDebugReset else { return }
        didApplyDebugReset = true
        guard ProcessInfo.processInfo.arguments.contains("-HausSeasonReset") else { return }
        save(SeasonalIconRecords())
    }
    #endif

    private static func years(_ defaults: UserDefaults, _ key: String) -> Set<Int> {
        Set(defaults.array(forKey: key)?.compactMap { $0 as? Int } ?? [])
    }
}
