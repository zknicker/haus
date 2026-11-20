FROM oven/bun:1.4.4-debian

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git iptables \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --filter @haus/runner --production

RUN groupadd --gid 10001 haus-runner \
    && useradd --uid 10001 --gid 10001 --home-dir /home/haus-runner --create-home --shell /usr/sbin/nologin haus-runner \
    && mkdir /data \
    && chown haus-runner:haus-runner /data

ENV HAUS_RUNNER_DATA_DIR=/data
VOLUME /data

WORKDIR /app/apps/runner
ENTRYPOINT ["/app/apps/runner/container/entrypoint.sh"]
CMD ["bun", "src/index.ts"]
