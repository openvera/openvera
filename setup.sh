#!/usr/bin/env bash
set -euo pipefail

# ─── Colors & helpers ─────────────────────────────────────────────────────────

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "  ${BLUE}ℹ${NC}  $1"; }
success() { echo -e "  ${GREEN}✔${NC}  $1"; }
warn()    { echo -e "  ${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "  ${RED}✖${NC}  $1"; }
section() { echo -e "\n${BOLD}${CYAN}$1${NC}\n"; }

# cd to script directory (project root)
cd "$(dirname "$0")"

COMPOSE_CMD=""
NEEDS_INIT=false

# ─── Banner ───────────────────────────────────────────────────────────────────

echo ""
echo -e "${BOLD}  OpenVera – Bokföring Setup${NC}"
echo ""

# ─── 1. Prerequisites ────────────────────────────────────────────────────────

section "🔍 Checking prerequisites"

if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Install from https://docs.docker.com/get-docker/"
    exit 1
fi
success "Docker found: $(docker --version | head -1)"

if docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    success "Docker Compose found: $($COMPOSE_CMD version --short)"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    success "Docker Compose found: $(docker-compose --version)"
else
    error "Docker Compose not found. Install from https://docs.docker.com/compose/install/"
    exit 1
fi

if ! docker info &> /dev/null 2>&1; then
    error "Docker daemon is not running. Start Docker Desktop or the Docker service."
    exit 1
fi
success "Docker daemon is running"

# ─── 2. Environment ──────────────────────────────────────────────────────────

section "⚙️  Configuring environment"

create_env=true

if [ -f .env ]; then
    warn ".env file already exists"
    read -rp "     Keep existing .env? [Y/n] " keep_env
    if [[ "${keep_env:-Y}" =~ ^[Nn]$ ]]; then
        cp .env ".env.backup.$(date +%s)"
        info "Backed up existing .env"
    else
        # Append any new vars from .env.example that are missing in .env
        added=0
        while IFS= read -r line; do
            # Skip comments and blank lines
            [[ "$line" =~ ^#.*$ || -z "$line" ]] && continue
            var_name="${line%%=*}"
            if ! grep -q "^${var_name}=" .env; then
                echo "$line" >> .env
                added=$((added + 1))
            fi
        done < .env.example
        if [ "$added" -gt 0 ]; then
            info "Added ${added} new variable(s) from .env.example"
        fi
        success "Keeping existing .env"
        create_env=false
    fi
fi

if [ "$create_env" = true ]; then
    SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null \
        || openssl rand -hex 32 2>/dev/null \
        || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n')

    sed "s/change-me-to-a-random-string/${SECRET_KEY}/" .env.example > .env
    success "Created .env with generated SECRET_KEY"
fi

# ─── 3. Data directory & database ────────────────────────────────────────────

section "📦 Setting up database"

DATA_DIR="./data"
DB_FILE="${DATA_DIR}/openvera.db"

mkdir -p "${DATA_DIR}"

if [ -f "${DB_FILE}" ]; then
    DB_SIZE=$(du -h "${DB_FILE}" | cut -f1)
    warn "Database already exists (${DB_SIZE})"
    echo ""
    echo "    1) Keep existing database"
    echo "    2) Start fresh (empty database)"
    echo ""
    read -rp "     Choose [1]: " db_choice
    db_choice="${db_choice:-1}"
else
    info "No database found — will create fresh"
    db_choice="2"
fi

case "${db_choice}" in
    1)
        success "Keeping existing database"
        ;;
    2)
        rm -f "${DB_FILE}"
        NEEDS_INIT=true
        info "Will initialize fresh database after build"
        ;;
esac

# ─── 4. Build ────────────────────────────────────────────────────────────────

section "🐳 Building Docker image"

$COMPOSE_CMD build --quiet
success "Docker image built"

# ─── 5. Fresh DB init (if needed, before starting) ───────────────────────────

if [ "$NEEDS_INIT" = true ]; then
    info "Initializing fresh database schema..."
    $COMPOSE_CMD run --rm openvera python /openvera/scripts/init_db.py
    success "Database schema created"

    section "🏢 Add companies"

    info "Add companies to the database (leave name empty to finish)"
    echo ""

    while true; do
        read -rp "     Company name (e.g. Acme AB): " company_name
        [ -z "$company_name" ] && break

        read -rp "     Org number (e.g. 556123-4567): " org_number
        read -rp "     Fiscal year start [01-01]: " fiscal_start
        fiscal_start="${fiscal_start:-01-01}"

        $COMPOSE_CMD run --rm openvera python -c "
import sys; sys.path.insert(0, '/openvera/scripts')
from init_db import add_company
from config import DB_PATH
add_company(str(DB_PATH), '''$company_name''', '''$org_number''', '''$fiscal_start''')
"
    done

    success "Company setup complete"
fi

# ─── 6. Start ────────────────────────────────────────────────────────────────

section "🚀 Starting container"

$COMPOSE_CMD up -d
success "Container started"

# ─── 7. Health check ─────────────────────────────────────────────────────────

section "🏥 Waiting for service"

MAX_WAIT=30
WAITED=0

while [ $WAITED -lt $MAX_WAIT ]; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8888/ 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        break
    fi
    sleep 1
    WAITED=$((WAITED + 1))
    printf "."
done
echo ""

if [ $WAITED -ge $MAX_WAIT ]; then
    error "Service failed to start within ${MAX_WAIT}s"
    info "Check logs: $COMPOSE_CMD logs openvera"
    exit 1
fi

success "Service is healthy (responded in ${WAITED}s)"

# ─── 8. Done ─────────────────────────────────────────────────────────────────

section "✅ Setup complete!"

echo -e "  ${BOLD}OpenVera is running at:${NC}"
echo ""
echo -e "    ${CYAN}http://localhost:8888${NC}"
echo ""
echo -e "  ${BOLD}Useful commands:${NC}"
echo ""
echo "    View logs:       $COMPOSE_CMD logs -f openvera"
echo "    Stop:            $COMPOSE_CMD down"
echo "    Restart:         $COMPOSE_CMD restart openvera"
echo "    Rebuild:         $COMPOSE_CMD up -d --build"
echo ""
