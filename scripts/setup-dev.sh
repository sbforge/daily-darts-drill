#!/usr/bin/env bash
# Sets up a fresh Linux machine (Debian/Ubuntu) for D³ development without root: Node 22, Rust, the libraries Tauri
# links against, fonts, and Playwright with Chromium for tools/screenshot. Everything goes under ~/.local and
# ~/.cargo; nothing is installed system-wide. Safe to run again: finished steps are skipped.
#
#   scripts/setup-dev.sh        then, in every new shell:   . ~/.d3-dev-env
#
# The Tauri libraries come as .deb files (apt-get download, no root) unpacked into ~/.local/sysroot. With root, the
# usual way is simpler: apt-get install pkg-config libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf
set -euo pipefail

NODE_MAJOR=22
PLAYWRIGHT_VERSION=1.52.0
SYS=$HOME/.local/sysroot
NODE_DIR=$HOME/.local/node
PW=$HOME/.local/d3-playwright
ENV_FILE=$HOME/.d3-dev-env
LIB=usr/lib/x86_64-linux-gnu
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

step() { printf '\n== %s\n' "$*"; }

step "Node $NODE_MAJOR"
if [ -x "$NODE_DIR/bin/node" ] && "$NODE_DIR/bin/node" -v | grep -q "^v$NODE_MAJOR\."; then
  echo "already there: $("$NODE_DIR/bin/node" -v)"
else
  base=https://nodejs.org/dist/latest-v$NODE_MAJOR.x
  curl -fsS "$base/SHASUMS256.txt" -o "$TMP/sums"
  tarball=$(grep -o "node-v$NODE_MAJOR[^ ]*-linux-x64.tar.xz" "$TMP/sums" | head -1)
  curl -fsSL "$base/$tarball" -o "$TMP/$tarball"
  (cd "$TMP" && grep " $tarball\$" sums | sha256sum -c -)
  rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
  tar -xJf "$TMP/$tarball" -C "$NODE_DIR" --strip-components=1
fi

step "Rust"
if [ -x "$HOME/.cargo/bin/cargo" ]; then
  echo "already there: $("$HOME/.cargo/bin/cargo" -V)"
else
  curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal --no-modify-path
fi

step "Tauri libraries and fonts (into $SYS)"
if [ -f "$SYS/.done" ]; then
  echo "already there"
else
  pkgs="pkg-config libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf fonts-liberation fonts-dejavu-core fonts-noto-color-emoji"
  # What apt would install on this machine, i.e. what isn't there yet.
  apt-get install -s $pkgs 2>/dev/null | awk '/^Inst/{print $2}' > "$TMP/list"
  echo "$(wc -l < "$TMP/list") packages"
  mkdir -p "$TMP/debs" "$SYS"
  (cd "$TMP/debs" && xargs -a "$TMP/list" apt-get download -q >/dev/null)
  for f in "$TMP"/debs/*.deb; do dpkg-deb -x "$f" "$SYS"; done
  # pkg-config files name /usr as their prefix.
  grep -rl '^prefix=/usr' "$SYS/$LIB/pkgconfig" "$SYS/usr/share/pkgconfig" 2>/dev/null | xargs -r sed -i "s|^prefix=/usr\$|prefix=$SYS/usr|"
  # Links into /usr point into the sysroot where the target is there, otherwise to the library already installed on
  # the system (dev packages link libfoo.so to a runtime package apt didn't download). Without that, the linker
  # falls back to the static .a and fails on their dependencies.
  find "$SYS" -type l | while read -r l; do
    t=$(readlink "$l")
    if [[ $t == /* ]]; then [ -e "$SYS$t" ] && ln -sfn "$SYS$t" "$l"
    elif [ ! -e "$l" ]; then
      for d in /$LIB /lib/x86_64-linux-gnu; do [ -e "$d/$(basename "$t")" ] && { ln -sfn "$d/$(basename "$t")" "$l"; break; }; done
    fi
  done
  touch "$SYS/.done"
fi

step "Font config"
mkdir -p "$HOME/.config/fontconfig"
cat > "$HOME/.config/fontconfig/d3-fonts.conf" <<EOF
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>/usr/share/fonts</dir>
  <dir>$SYS/usr/share/fonts</dir>
  <cachedir>$HOME/.cache/fontconfig</cachedir>
  <alias><family>Segoe UI</family><prefer><family>Liberation Sans</family></prefer></alias>
  <alias><family>system-ui</family><prefer><family>Liberation Sans</family></prefer></alias>
  <alias><family>sans-serif</family><prefer><family>Liberation Sans</family><family>DejaVu Sans</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>Liberation Mono</family><family>DejaVu Sans Mono</family></prefer></alias>
  <alias><family>emoji</family><prefer><family>Noto Color Emoji</family></prefer></alias>
</fontconfig>
EOF

step "Environment ($ENV_FILE)"
L="$SYS/$LIB:$SYS/lib/x86_64-linux-gnu"
cat > "$ENV_FILE" <<EOF
# D³ development, written by scripts/setup-dev.sh. Load with: . ~/.d3-dev-env
export PATH="$NODE_DIR/bin:\$HOME/.cargo/bin:$SYS/usr/bin:\$PATH"
export PKG_CONFIG="$SYS/usr/bin/pkgconf"
export PKG_CONFIG_PATH="$SYS/$LIB/pkgconfig:$SYS/usr/share/pkgconfig"
export LIBRARY_PATH="$L"
export LD_LIBRARY_PATH="$L\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}"
export RUSTFLAGS="-L $SYS/$LIB -L $SYS/lib/x86_64-linux-gnu -C link-arg=-Wl,-rpath-link,$SYS/$LIB -C link-arg=-Wl,-rpath-link,$SYS/lib/x86_64-linux-gnu -C link-arg=-Wl,-rpath-link,/$LIB"
export FONTCONFIG_FILE="$HOME/.config/fontconfig/d3-fonts.conf"
export PLAYWRIGHT_BROWSERS_PATH="$PW/browsers"
EOF
# shellcheck disable=SC1090
. "$ENV_FILE"

step "Playwright $PLAYWRIGHT_VERSION with Chromium (into $PW)"
mkdir -p "$PW"
[ -f "$PW/package.json" ] || echo '{"private":true}' > "$PW/package.json"
npm install --prefix "$PW" --no-audit --no-fund --loglevel=error "playwright@$PLAYWRIGHT_VERSION"
"$PW/node_modules/.bin/playwright" install chromium-headless-shell

step "npm dependencies"
cd "$(dirname "$0")/.."
npm ci --ignore-scripts --no-audit --no-fund --loglevel=error

printf '\nDone. In every new shell: . %s\n' "$ENV_FILE"
