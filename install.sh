#!/bin/bash

# FPP Control Center - installation entry point.
# setup.sh is the one installer (dependencies, database, FPP discovery, .env.local, build, PM2);
# this file only keeps the older `./install.sh` command working.

cd "$(dirname "$0")" || exit 1
exec bash ./setup.sh "$@"
