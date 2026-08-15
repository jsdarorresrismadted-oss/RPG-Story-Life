#!/usr/bin/env bash
# =====================================================================
# Setup inicial da VM (Oracle Cloud Always Free / Ubuntu ARM ou x64).
# Executar como root:  sudo bash deploy/setup-vm.sh
# Idempotente: pode rodar de novo sem quebrar nada.
# =====================================================================
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive

APP_DIR="/opt/rpg-story-life"
APP_USER="${APP_USER:-ubuntu}"

echo "==> 1/6 Pacotes base"
apt-get update -y
apt-get install -y ca-certificates curl gnupg lsb-release git rsync build-essential \
  postgresql postgresql-contrib redis-server nginx certbot python3-certbot-nginx

echo "==> 2/6 Node.js 20"
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node -v

echo "==> 3/6 Diretório da aplicação"
mkdir -p "$APP_DIR"
if id "$APP_USER" >/dev/null 2>&1; then
  chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
fi

echo "==> 4/6 Arquivo .env (crie/edite antes do primeiro deploy!)"
if [ ! -f "$APP_DIR/.env" ]; then
  cp deploy/vm-env.template "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  echo "    Template copiado para $APP_DIR/.env — EDITE com as variáveis do Railway!"
fi

echo "==> 5/6 PostgreSQL (banco local)"
set -a
# shellcheck disable=SC1091
source "$APP_DIR/.env"
set +a
DB_USER="${DB_USER:-rpgstory}"
DB_PASSWORD="${DB_PASSWORD:-CHANGE_ME}"
DB_NAME="${DB_NAME:-rpgstorylife}"

if [ "$DB_PASSWORD" = "CHANGE_ME" ]; then
  echo "    ATENCAO: DB_PASSWORD ainda e CHANGE_ME — defina no $APP_DIR/.env"
fi

sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE ROLE \"$DB_USER\" LOGIN PASSWORD '$DB_PASSWORD';"
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 || \
  sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
systemctl enable --now postgresql
systemctl enable --now redis-server

echo "==> 6/6 systemd + nginx"
cp deploy/rpg-backend.service /etc/systemd/system/rpg-backend.service
systemctl daemon-reload
systemctl enable rpg-backend

cp deploy/nginx-rpg.conf /etc/nginx/sites-available/rpg
ln -sf /etc/nginx/sites-available/rpg /etc/nginx/sites-enabled/rpg
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx

echo
echo "=============================================================="
echo " PRONTO! Proximos passos:"
echo "  1) Edite $APP_DIR/.env (veja deploy/vm-env.template):"
echo "     - DATABASE_URL / DB_USER / DB_PASSWORD / DB_NAME"
echo "     - JWT_SECRET, GEMINI_API_KEY, GROQ_API_KEY"
echo "     - FRONTEND_URL / ADMIN_URL / CORS_ORIGIN (dominio novo)"
echo "     - ADMIN_EMAIL / ADMIN_PASSWORD"
echo "  2) Libere no Firewall da Oracle (Security List): 22, 80, 443"
echo "  3) Aponte o DNS do dominio para o IP publico da VM"
echo "  4) HTTPS: sudo certbot --nginx -d seu-dominio.com"
echo "  5) Clone o repo e faca o primeiro build:"
echo "     cd $APP_DIR"
echo "     git clone <seu-repo.git> .  (usando uma Deploy Key do GitHub)"
echo "     node scripts/deploy-vm.js --host ubuntu@IP --deploy-key <caminho-da-key>"
echo "  6) Migrar os dados do Railway: node scripts/deploy-vm.js --migrate-data"
echo "=============================================================="