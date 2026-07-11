#!/bin/sh
set -eu

usage() {
  echo "Usage: $0 https://openjobs.omnestack.com" >&2
}

if [ "$#" -ne 1 ]; then
  usage
  exit 2
fi

BASE_URL=$1
BASE_URL=${BASE_URL%/}

case "$BASE_URL" in
  https://*) ;;
  *)
    echo "error: base URL must start with https://" >&2
    exit 2
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  echo "error: curl is required" >&2
  exit 2
fi

HEADERS_FILE=$(mktemp)
HEALTH_FILE=$(mktemp)

cleanup() {
  rm -f "$HEADERS_FILE" "$HEALTH_FILE"
}
trap cleanup EXIT HUP INT TERM

echo "Checking HTTPS headers for $BASE_URL ..."
curl -fsSIL --max-time 20 "$BASE_URL/" >"$HEADERS_FILE"

if ! grep -Eq '^HTTP/[0-9.]+ 2[0-9][0-9]' "$HEADERS_FILE"; then
  echo "error: HTTPS headers did not include a 2xx response" >&2
  sed -n '1,20p' "$HEADERS_FILE" >&2
  exit 1
fi

sed -n '1,12p' "$HEADERS_FILE"

echo
echo "Checking health endpoint $BASE_URL/health ..."
curl -fsS --max-time 20 "$BASE_URL/health" >"$HEALTH_FILE"

if [ ! -s "$HEALTH_FILE" ]; then
  echo "error: /health returned an empty body" >&2
  exit 1
fi

printf '/health response: '
sed -n '1p' "$HEALTH_FILE"

echo "Smoke check passed."
