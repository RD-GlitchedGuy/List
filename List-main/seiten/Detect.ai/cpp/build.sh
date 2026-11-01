#!/bin/sh
# Kompiliert den C++-Kern zu WebAssembly und bettet ihn in js/wasm-core.js ein.
cd "$(dirname "$0")/.."
clang++ --target=wasm32 -O3 -nostdlib -fno-builtin -fno-exceptions -fno-rtti \
  -Wl,--no-entry -Wl,--strip-all -o cpp/detector.wasm cpp/detector.cpp || exit 1
printf '// Automatisch erzeugt aus cpp/detector.cpp – nicht von Hand bearbeiten\nwindow.SKY_WASM="%s";\n' \
  "$(base64 -w0 cpp/detector.wasm)" > js/wasm-core.js
rm cpp/detector.wasm
echo "OK: js/wasm-core.js"
