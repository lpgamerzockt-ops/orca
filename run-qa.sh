#!/bin/bash
set -u
cd "$(git rev-parse --show-toplevel)"
echo "##### PR head"; bash qa-claude.sh
git fetch -q origin main && git checkout -q origin/main -- config/scripts/typecheck/language-server config/agent-plugins
echo "##### main baseline"; bash qa-claude.sh
git checkout -q HEAD -- config/scripts/typecheck/language-server config/agent-plugins
