// swift-tools-version: 6.2

import PackageDescription

let package = Package(
    name: "HausIOS",
    platforms: [
        .iOS(.v26),
        .macOS(.v26),
    ],
    products: [
        .library(name: "HausModels", targets: ["HausModels"]),
        .library(name: "HausTransport", targets: ["HausTransport"]),
        .library(name: "HausUI", targets: ["HausUI"]),
        .library(name: "HausAppModel", targets: ["HausAppModel"]),
    ],
    targets: [
        .target(
            name: "HausModels",
            path: "Sources/HausModels",
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
        .target(
            name: "HausTransport",
            dependencies: ["HausModels"],
            path: "Sources/HausTransport",
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
        .target(
            name: "HausUI",
            dependencies: ["HausModels"],
            path: "Sources/HausUI",
            resources: [.process("Resources")],
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
        .target(
            name: "HausAppModel",
            dependencies: ["HausModels", "HausTransport"],
            path: "Sources/HausAppModel",
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
        .testTarget(
            name: "HausAppModelTests",
            dependencies: ["HausAppModel"],
            path: "Tests/HausAppModelTests",
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
        .testTarget(
            name: "HausModelsTests",
            dependencies: ["HausModels"],
            path: "Tests/HausModelsTests",
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
        .testTarget(
            name: "HausTransportTests",
            dependencies: ["HausTransport"],
            path: "Tests/HausTransportTests",
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
        .testTarget(
            name: "HausUITests",
            dependencies: ["HausUI"],
            path: "Tests/HausUITests",
            swiftSettings: [.enableUpcomingFeature("StrictConcurrency")]
        ),
    ]
)
