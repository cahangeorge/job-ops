#!/bin/sh
# Job Ops container entrypoint.
#
# The Cloudflare challenge viewer is started lazily by the server only when a
# challenge needs human interaction. Keeping it out of startup avoids carrying
# idle Xvfb/x11vnc/noVNC processes on every normal pipeline run.

# Run the app
cd /app/orchestrator
exec npm run start
