import SwiftUI

/// The faux-glass stack that fills the iridescent ghost, painted into a
/// `Canvas`.
///
/// The mark is a piece of thick, translucent glass, not a painted sticker. What
/// draws the shape is the rim: light entering a thick body piles up where the
/// surface turns away from the viewer, which is why a glass object is hollow in
/// the middle and luminous around its silhouette.
///
/// A soft colored halo sits outside the silhouette, then four layers clipped to
/// the body, painted back to front: the interior scatter; the drifting color
/// mesh, weighted right and down so the upper left stays nearly clear; a
/// colored inner glow tracing the whole silhouette, which is what keeps the
/// mark legible on a light ground where white cannot; and a white inner glow
/// over the upper-left dome only. Every glow is a blurred stroke of the body
/// path clipped back to the body — an inner glow follows the silhouette
/// exactly, where a radial gradient would band on a shape this asymmetric.
///
/// Two things are carried differently from the web's SVG, and only these two:
///
/// - **Masks.** SVG masks by luminance; `Canvas` masks by compositing
///   `destinationIn`. Each mask is drawn into its own layer and then punched
///   through, with its gray ramp read as alpha. For the fade masks that is the
///   same number the browser computes. For the rim mask — an opaque gray floor
///   under a blurred white stroke — it is also exact: `floor + (1 - floor) * a`
///   is what both compositors arrive at.
/// - **Blur.** `feGaussianBlur`'s `stdDeviation` is passed straight to
///   `GraphicsContext.Filter.blur(radius:)`, which takes a standard deviation
///   too. Radii scale with the mark, so a 22pt row blurs by 22/204ths of what a
///   full-size mark does.
struct HausGhostCanvas {
    /// The mark's drawn height in points; everything else derives from it.
    let height: CGFloat
    let ground: HausGhostGround
    /// One translate per mesh blob, in unit space.
    let offsets: [CGSize]

    func draw(_ context: inout GraphicsContext) {
        let body = HausGhostPaths.scaled(HausGhostPaths.body, by: scale)
        let eyes = HausGhostPaths.scaled(HausGhostPaths.eyes, by: scale)

        drawHalo(&context, body: body)
        context.drawLayer { inside in
            inside.blendMode = .normal
            inside.clip(to: body)
            drawInterior(&inside)
            drawMesh(&inside, body: body)
            drawDome(&inside, body: body)
            drawSpeculars(&inside)
        }
        drawEdge(&context, body: body)
        context.fill(eyes, with: .color(HausGhostPalette.eye))
    }

    // MARK: - Layers

    /// Outside the clip, under everything: the ground picking up the mark's own
    /// color, which is what lifts it off both a white page and a near-black
    /// sidebar. Tight enough that it never reads as haze in a 22pt row.
    private func drawHalo(_ context: inout GraphicsContext, body: Path) {
        context.drawLayer { halo in
            halo.blendMode = .normal
            halo.opacity = ground.halo
            halo.addFilter(.blur(radius: unit(2.5)))
            halo.stroke(body, with: rimShading, lineWidth: unit(3))
        }
    }

    private func drawInterior(_ context: inout GraphicsContext) {
        context.fill(
            Path(markRect),
            with: .radialGradient(
                ground.interiorGradient,
                center: point(70, 76),
                startRadius: 0,
                endRadius: unit(140)
            )
        )
    }

    /// The drifting mesh and the colored rim fade together under one side mask,
    /// so the upper-left quadrant stays clear enough for the white highlight to
    /// own it. The mesh alone also passes the rim mask — hollow in the middle,
    /// luminous at the silhouette — which is the one gradient that makes a
    /// translucent shape read as thick glass.
    private func drawMesh(_ context: inout GraphicsContext, body: Path) {
        context.drawLayer { sided in
            sided.blendMode = .normal
            sided.drawLayer { rimmed in
                rimmed.blendMode = .normal
                rimmed.drawLayer { mesh in
                    mesh.blendMode = .normal
                    mesh.addFilter(.blur(radius: unit(22)))
                    for (blob, offset) in zip(HausGhostDrift.blobs, offsets) {
                        mesh.fill(circle(blob, offset), with: .color(blob.color.opacity(blob.opacity)))
                    }
                }
                punch(&rimmed) { mask in
                    mask.fill(
                        Path(maskRect),
                        with: .color(.white.opacity(HausGhostPalette.rimMaskFloor))
                    )
                    mask.drawLayer { band in
                        band.blendMode = .normal
                        band.addFilter(.blur(radius: unit(10)))
                        // Straddles the path; the body clip throws away the
                        // outer half.
                        band.stroke(body, with: .color(.white), lineWidth: unit(40))
                    }
                }
            }

            // Wide and quiet, not narrow and loud: this is the layer that
            // carries the rose along the lower-right contour, so it earns its
            // reach from width and blur rather than from opacity.
            sided.drawLayer { rim in
                rim.blendMode = .normal
                rim.opacity = 0.55
                rim.addFilter(.blur(radius: unit(10)))
                rim.stroke(body, with: rimShading, lineWidth: unit(29))
            }

            punch(&sided) { mask in
                mask.fill(
                    Path(maskRect),
                    with: .linearGradient(
                        HausGhostPalette.sideFade,
                        startPoint: point(18, 14),
                        endPoint: point(150, 172)
                    )
                )
            }
        }
    }

    /// A soft bloom over the upper-left dome with a hot line inside it. A thick
    /// edge of glass catches a hard highlight, not a wash — without the line the
    /// glow alone just fogs the interior.
    private func drawDome(_ context: inout GraphicsContext, body: Path) {
        context.drawLayer { domed in
            domed.blendMode = .normal
            domed.drawLayer { light in
                light.blendMode = .normal
                light.opacity = 0.22
                light.addFilter(.blur(radius: unit(5)))
                light.stroke(body, with: .color(HausGhostPalette.highlight), lineWidth: unit(12))
            }
            domed.drawLayer { core in
                core.blendMode = .normal
                core.opacity = 0.95
                core.addFilter(.blur(radius: unit(2)))
                core.stroke(body, with: .color(HausGhostPalette.highlight), lineWidth: unit(13))
            }
            punch(&domed) { mask in
                mask.fill(
                    Path(maskRect),
                    with: .linearGradient(
                        HausGhostPalette.domeFade,
                        startPoint: point(14, 40),
                        endPoint: point(150, 110)
                    )
                )
            }
        }
    }

    private func drawSpeculars(_ context: inout GraphicsContext) {
        for spot in HausGhostPalette.speculars {
            context.drawLayer { specular in
                specular.blendMode = .normal
                specular.opacity = HausGhostPalette.specularStrength * spot.weight
                specular.addFilter(.blur(radius: unit(5)))
                specular.fill(ellipse(spot), with: .color(HausGhostPalette.highlight))
            }
        }
    }

    /// A constant hairline at every rendered size, in the mesh's own colors: on
    /// a light ground it is what carries the upper-left silhouette, where the
    /// white rim has nothing to say. Drawn outside the clip, so both of its
    /// halves survive.
    private func drawEdge(_ context: inout GraphicsContext, body: Path) {
        context.drawLayer { edge in
            edge.blendMode = .normal
            edge.opacity = HausGhostPalette.edgeStrength
            edge.stroke(
                body,
                with: .linearGradient(
                    HausGhostPalette.edgeStops,
                    startPoint: point(26, 16),
                    endPoint: point(164, 192)
                ),
                // The web's `non-scaling-stroke`: one point of outline whatever
                // the mark's size.
                lineWidth: 1
            )
        }
    }

    // MARK: - Unit space

    private var scale: CGFloat { HausGhostPaths.scale(forHeight: height) }

    private func unit(_ value: CGFloat) -> CGFloat { value * scale }

    private func point(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
        CGPoint(x: x * scale, y: y * scale)
    }

    private var markRect: CGRect {
        CGRect(x: 0, y: 0, width: unit(HausGhostPaths.viewBoxWidth), height: height)
    }

    /// Room for every blurred stroke a mask has to cover. The body clip throws
    /// the rest away.
    private var maskRect: CGRect { markRect.insetBy(dx: -unit(60), dy: -unit(60)) }

    private func circle(_ blob: HausGhostBlob, _ offset: CGSize) -> Path {
        let center = CGPoint(x: blob.center.x + offset.width, y: blob.center.y + offset.height)
        return Path(
            ellipseIn: CGRect(
                x: unit(center.x - blob.radius),
                y: unit(center.y - blob.radius),
                width: unit(blob.radius * 2),
                height: unit(blob.radius * 2)
            )
        )
    }

    private func ellipse(_ spot: HausGhostPalette.Specular) -> Path {
        let box = CGRect(
            x: -unit(spot.radiusX),
            y: -unit(spot.radiusY),
            width: unit(spot.radiusX * 2),
            height: unit(spot.radiusY * 2)
        )
        let placed = CGAffineTransform(translationX: unit(spot.x), y: unit(spot.y))
            .rotated(by: spot.degrees * .pi / 180)
        return Path(ellipseIn: box).applying(placed)
    }

    private var rimShading: GraphicsContext.Shading {
        .linearGradient(
            HausGhostPalette.rimColorStops,
            startPoint: point(158, 16),
            endPoint: point(86, 200)
        )
    }

    /// Keeps only the part of everything drawn so far in this layer that the
    /// mask covers. The mask is built in its own layer first: composited one
    /// draw at a time it would punch with each piece separately, and the last
    /// piece would erase what the others kept.
    private func punch(
        _ context: inout GraphicsContext,
        mask: (inout GraphicsContext) -> Void
    ) {
        context.blendMode = .destinationIn
        context.drawLayer { layer in
            layer.blendMode = .normal
            mask(&layer)
        }
        context.blendMode = .normal
    }
}
