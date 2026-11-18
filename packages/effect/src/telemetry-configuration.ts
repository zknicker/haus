import { ATTR_DEPLOYMENT_ENVIRONMENT_NAME } from '@opentelemetry/semantic-conventions';

export interface ProcessTelemetryEnvironment {
    readonly OTEL_EXPORTER_OTLP_ENDPOINT?: string;
    readonly OTEL_EXPORTER_OTLP_HEADERS?: string;
    readonly OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?: string;
    readonly OTEL_EXPORTER_OTLP_METRICS_HEADERS?: string;
    readonly OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?: string;
    readonly OTEL_EXPORTER_OTLP_TRACES_HEADERS?: string;
    readonly OTEL_RESOURCE_ATTRIBUTES?: string;
    readonly OTEL_SDK_DISABLED?: string;
}

export interface TelemetryRelayConnection {
    readonly authorization: string;
    readonly deploymentEnvironment: 'development' | 'production' | 'test';
    readonly endpoint: string;
}

export function readProcessTelemetryEnvironment(): ProcessTelemetryEnvironment {
    return {
        OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
        OTEL_EXPORTER_OTLP_HEADERS: process.env.OTEL_EXPORTER_OTLP_HEADERS,
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
        OTEL_EXPORTER_OTLP_METRICS_HEADERS: process.env.OTEL_EXPORTER_OTLP_METRICS_HEADERS,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT,
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: process.env.OTEL_EXPORTER_OTLP_TRACES_HEADERS,
        OTEL_RESOURCE_ATTRIBUTES: process.env.OTEL_RESOURCE_ATTRIBUTES,
        OTEL_SDK_DISABLED: process.env.OTEL_SDK_DISABLED,
    };
}

export function telemetryEnabled(environment: ProcessTelemetryEnvironment): boolean {
    return (
        !telemetryDisabled(environment) &&
        Boolean(
            environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim() ||
            environment.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim() ||
            environment.OTEL_EXPORTER_OTLP_ENDPOINT?.trim()
        )
    );
}

export function telemetryDisabled(environment: ProcessTelemetryEnvironment): boolean {
    return environment.OTEL_SDK_DISABLED?.trim().toLowerCase() === 'true';
}

export function exporterConfig(
    environment: ProcessTelemetryEnvironment,
    signal: 'metrics' | 'traces'
) {
    const specificEndpoint =
        signal === 'metrics'
            ? environment.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT?.trim()
            : environment.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT?.trim();
    const sharedEndpoint = environment.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
    const signalHeaders =
        signal === 'metrics'
            ? environment.OTEL_EXPORTER_OTLP_METRICS_HEADERS
            : environment.OTEL_EXPORTER_OTLP_TRACES_HEADERS;
    const headers = {
        ...parseOtlpHeaders(environment.OTEL_EXPORTER_OTLP_HEADERS),
        ...parseOtlpHeaders(signalHeaders),
    };
    return {
        ...(Object.keys(headers).length > 0 ? { headers } : {}),
        ...(specificEndpoint
            ? { url: specificEndpoint }
            : sharedEndpoint
              ? { url: `${sharedEndpoint.replace(/\/+$/u, '')}/v1/${signal}` }
              : {}),
    };
}

export function relayEnvironment(
    connection: TelemetryRelayConnection
): ProcessTelemetryEnvironment {
    const endpoint = connection.endpoint.replace(/\/+$/u, '');
    const authorization = encodeURIComponent(connection.authorization);
    return {
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: `${endpoint}/v1/metrics`,
        OTEL_EXPORTER_OTLP_METRICS_HEADERS: `Authorization=${authorization}`,
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `${endpoint}/v1/traces`,
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: `Authorization=${authorization}`,
    };
}

export function parseDeploymentEnvironment(value?: string) {
    const environment = value
        ?.split(',')
        .map((entry) => entry.trim().split('='))
        .find(([key]) => key === ATTR_DEPLOYMENT_ENVIRONMENT_NAME)?.[1]
        ?.trim();
    return environment === 'development' || environment === 'production' || environment === 'test'
        ? environment
        : undefined;
}

function parseOtlpHeaders(value?: string): Record<string, string> {
    if (!value?.trim()) {
        return {};
    }
    return Object.fromEntries(
        value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .flatMap((entry) => {
                const separator = entry.indexOf('=');
                if (separator <= 0) {
                    return [];
                }
                try {
                    return [
                        [
                            entry.slice(0, separator).trim(),
                            decodeURIComponent(entry.slice(separator + 1).trim()),
                        ] as const,
                    ];
                } catch {
                    return [];
                }
            })
    );
}
