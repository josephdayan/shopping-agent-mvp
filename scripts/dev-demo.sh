#!/usr/bin/env bash
# TEMP demo launcher: runs the app locally with a MOCK WhatsApp provider (never sends a
# real message), no /ops token (so the panel opens freely), the concierge flow on, and a
# fake operator pickup base. DATABASE_URL is pulled from .env because .env.local overrides
# it with an empty value in Next.js. Delete after the demo.
set -e
export DATABASE_URL="$(grep '^DATABASE_URL=' .env | cut -d'=' -f2- | tr -d '"')"
export WHATSAPP_PROVIDER=mock
export OPENAI_API_KEY=
export API_TOKEN=
export OPS_TOKEN=
export LIA_MANUAL_CONCIERGE=true
export LIA_OPERATOR_PICKUP_ADDRESS="Rua da Base, 10, São Paulo - SP"
export LIA_OPERATOR_PICKUP_CEP=01310-100
exec npx next dev -p 3100
