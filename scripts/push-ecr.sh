#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <ecr-repository-url> [tag]" >&2
  exit 1
fi

REPO_URL="$1"
TAG="${2:-latest}"
REGION="${AWS_REGION:-${AWS_DEFAULT_REGION:-ap-southeast-1}}"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "${REPO_URL%%/*}"

docker build --platform linux/arm64 -t "$REPO_URL:$TAG" .
docker push "$REPO_URL:$TAG"

echo "Pushed $REPO_URL:$TAG"
