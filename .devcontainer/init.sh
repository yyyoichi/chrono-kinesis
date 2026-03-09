. $NVM_DIR/nvm.sh
nvm install --lts
nvm use --lts

if [ -z "$(ls -A .pnpm-store)" ]; then
  sudo chown -R vscode:vscode .pnpm-store
#   pnpm install --frozen-lockfile
fi