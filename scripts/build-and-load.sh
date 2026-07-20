#!/usr/bin/env bash
set -euo pipefail
npm --workspace @claude-in-browser-k8s/web-client run build
docker build -f apps/pod-server/Dockerfile -t claude-lab/pod-server:dev .
docker build -f apps/gateway/Dockerfile    -t claude-lab/gateway:dev .
kind load docker-image claude-lab/pod-server:dev --name claude-lab
kind load docker-image claude-lab/gateway:dev    --name claude-lab
echo "images built and loaded into kind"
