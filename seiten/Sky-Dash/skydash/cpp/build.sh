#!/bin/sh
# Sky Dash – Level-Compiler bauen und Level neu erzeugen (Mac/Linux)
cd "$(dirname "$0")" || exit 1
g++ -O2 -std=c++17 leveltool.cpp -o leveltool && ./leveltool levels -o ../js/levels.js
