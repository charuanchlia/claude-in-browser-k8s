#!/usr/bin/env bash
set -euo pipefail
kind create cluster --name claude-lab --config kind-config.yaml
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/rbac.yaml
echo "cluster ready. next: scripts/create-secret.sh && scripts/build-and-load.sh"
