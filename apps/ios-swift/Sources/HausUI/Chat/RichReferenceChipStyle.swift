import SwiftUI

#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// The brand ink an appearance override gives a reference's mark, mirroring the
/// App's `brandColor`.
///
/// One case, because the App names one brand: Chrome, in the `--success` token,
/// which resolves to the same green under both themes.
public enum ReferenceBrandInk: Hashable, Sendable {
    case success

    public var color: Color {
        switch self {
        case .success: Color(red: 0x17 / 255, green: 0xC9 / 255, blue: 0x64 / 255)
        }
    }
}

/// The App's `--accent-soft-foreground`, the ink its Agent chips read in.
///
/// iOS has no semantic color for it, so the two stops the token resolves to are
/// named here: `--accent` mixed with `--foreground` in oklab, 70/30 on a light
/// page and 80/30 on a dark one (HeroUI's dark theme weights the accent more),
/// which is a deepened blue in light and a lightened one in dark.
enum AgentReferenceInk {
    static let light = Color(red: 0x1E / 255, green: 0x63 / 255, blue: 0xAE / 255)
    static let dark = Color(red: 0x61 / 255, green: 0xA8 / 255, blue: 0xFB / 255)
}

/// A reference's ink.
///
/// Every iOS value is a dynamic color, so a color-scheme change repaints the
/// body without rebuilding its attributed string.
enum RichReferenceChipInk {
    #if canImport(UIKit)
    static var bodyText: UIColor { .label }

    /// Quoted words read a step back from the body, the way the App's
    /// blockquote takes `--muted`.
    static var mutedText: UIColor { .secondaryLabel }

    /// The tint a code span sits on. The App mixes 7% of the foreground into
    /// whatever surface the span lands on rather than naming a flat token, so
    /// the phone takes the system fill that resolves the same way in both
    /// schemes.
    static var codeGround: UIColor { .quaternarySystemFill }

    /// A link this client does not chip reads in the system's own link ink, the
    /// nearest thing iOS has to the App's anchor color.
    static var linkText: UIColor { .link }

    /// A brand reads in its brand's ink, an Agent in the App's accent, a channel
    /// in its own configured color, and a skill in the App's dedicated purple.
    /// A channel with no preset, and every other kind, reads as ordinary ink —
    /// which is what the App's default chip foreground resolves to in both
    /// themes.
    ///
    /// This is the whole reference now: the App's chip is the transparent
    /// `tertiary` shell, so the ink and the dotted rule under it carry the
    /// identity that a ground used to.
    static func labelTint(for reference: RichReferencePresentation) -> UIColor {
        if case .brandGlyph(_, let brand) = reference.mark { return brandTint(brand) }
        if reference.kind == .agent { return accentReference }
        if reference.kind == .skill { return skillReference }
        guard reference.kind == .channel, let preset = preset(for: reference) else {
            return .label
        }
        return dynamic(light: preset.light, dark: preset.dark)
    }

    /// The App's `--accent-soft-foreground`, which its Agent chips take from
    /// `color="accent"`: the accent mixed 70/30 with the page's foreground, so
    /// it darkens on a light page and lightens on a dark one.
    static var accentReference: UIColor {
        dynamic(light: AgentReferenceInk.light, dark: AgentReferenceInk.dark)
    }

    /// A brand mark's own ink. The App's `brandColor` lands on `--chip-fg`, so
    /// it inks the whole chip foreground — the mark and the label both.
    static func brandTint(_ brand: ReferenceBrandInk) -> UIColor { UIColor(brand.color) }

    /// The App's `--skill-reference` product token, whose two ramp stops
    /// `SkillReferenceInk` names once for every surface that draws a Skill.
    static var skillReference: UIColor {
        dynamic(light: SkillReferenceInk.light, dark: SkillReferenceInk.dark)
    }

    /// The App derives the mark's box from the glyph tint at 11% light / 13%
    /// dark; an unset or unknown color renders the neutral `default` token.
    static func markGround(for appearance: ChannelAppearance) -> UIColor {
        guard let preset = ChannelColorPalette.preset(for: appearance.color) else {
            return UIColor { traits in
                UIColor.label
                    .resolvedColor(with: traits)
                    .withAlphaComponent(traits.userInterfaceStyle == .dark ? 0.12 : 0.075)
            }
        }
        return dynamic(light: preset.light.opacity(0.11), dark: preset.dark.opacity(0.13))
    }

    static func markTint(for appearance: ChannelAppearance) -> UIColor {
        guard let preset = ChannelColorPalette.preset(for: appearance.color) else {
            return .secondaryLabel
        }
        return dynamic(light: preset.light, dark: preset.dark)
    }

    /// `AvatarView`'s initials look: a muted disc under the accent tint.
    static var initialsGround: UIColor {
        UIColor { traits in
            UIColor.secondaryLabel.resolvedColor(with: traits).withAlphaComponent(0.1)
        }
    }

    static var initialsTint: UIColor { .tintColor }

    private static func dynamic(light: Color, dark: Color) -> UIColor {
        let lightColor = UIColor(light)
        let darkColor = UIColor(dark)
        return UIColor { $0.userInterfaceStyle == .dark ? darkColor : lightColor }
    }
    #elseif canImport(AppKit)
    // macOS hosts the package for `swift test` only; the stand-in body draws
    // labels without their marks, so these are the light values, flat.
    static var bodyText: NSColor { .labelColor }
    static var mutedText: NSColor { .secondaryLabelColor }
    static var codeGround: NSColor { .quaternaryLabelColor }
    static var linkText: NSColor { .linkColor }

    static func brandTint(_ brand: ReferenceBrandInk) -> NSColor { NSColor(brand.color) }

    static func labelTint(for reference: RichReferencePresentation) -> NSColor {
        if case .brandGlyph(_, let brand) = reference.mark { return brandTint(brand) }
        if reference.kind == .agent {
            return NSColor(AgentReferenceInk.light)
        }
        if reference.kind == .skill {
            return NSColor(SkillReferenceInk.light)
        }
        guard reference.kind == .channel, let preset = preset(for: reference) else {
            return .labelColor
        }
        return NSColor(preset.light)
    }
    #endif

    private static func preset(for reference: RichReferencePresentation) -> ChannelColorPreset? {
        ChannelColorPalette.preset(for: (reference.channelAppearance ?? .default).color)
    }
}
