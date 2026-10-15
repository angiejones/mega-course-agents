FROM node:22.23.3-bookworm
USER root
RUN apt-get update \
    && apt-get install -y --no-install-recommends git sqlite3 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global npm@10.9.9
USER node
