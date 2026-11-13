/// The rule Chat states a message's claim by.
///
/// A claim is bookkeeping for an Agent before it is anything a person reads: an
/// Agent claims a message before working on it, and almost every one of those
/// claims is over inside the turn that opened it. So a `claimed` claim states
/// nothing in Chat unless the reader asked for it. A human composed or
/// converted a claim on purpose, so Chat always shows that one.
///
/// This is the App's `claimVisibleInChat`, ported whole: the preference that
/// feeds it is per device on both surfaces, but the rule is the product's.
public enum ClaimVisibility {
    public static func visibleInChat(origin: ClaimOrigin, showClaimsInChat: Bool) -> Bool {
        showClaimsInChat || origin != .claimed
    }
}
