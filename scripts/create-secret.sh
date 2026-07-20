#!/usr/bin/env bash
set -euo pipefail
TOKEN="$(cat .secrets/oauth-token)"
kubectl create secret generic claude-token -n claude-lab \
  --from-literal=token="$TOKEN" --dry-run=client -o yaml | kubectl apply -f -
echo "secret claude-token created/updated"
