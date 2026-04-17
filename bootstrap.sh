#!/usr/bin/env bash
# Steel — Phase 0 Bootstrap
# Run once, from the root of your freshly cloned steel repo.
# Renames companion → steel, sets up STEEL.md, verifies baseline works.

set -euo pipefail

echo "🔨 Steel Phase 0 Bootstrap"
echo "=========================="
echo ""

# --- Sanity checks ---------------------------------------------------------

if [ ! -d ".git" ]; then
  echo "❌ Not a git repo. Run this from the root of your cloned steel fork."
  exit 1
fi

if ! git remote get-url origin 2>/dev/null | grep -qE "steel|bagclaim-oss"; then
  echo "⚠️  origin doesn't look like a steel fork. Continuing anyway."
fi

if [ ! -f "STEEL.md" ]; then
  echo "❌ STEEL.md not found at repo root. Drop the STEEL.md you generated earlier here, then re-run."
  exit 1
fi

if ! command -v bun &>/dev/null; then
  echo "❌ Bun not installed. Install from https://bun.sh and re-run."
  exit 1
fi

echo "✅ Prereq checks passed"
echo ""

# --- Add upstream remote ---------------------------------------------------

if ! git remote | grep -q "^upstream$"; then
  echo "➕ Adding upstream remote (companion)"
  git remote add upstream https://github.com/The-Vibe-Company/companion.git
else
  echo "✓ upstream remote already set"
fi
echo ""

# --- Install deps & verify companion baseline works ------------------------

echo "📦 Installing dependencies"
bun install
echo ""

echo "🧪 Running typecheck to confirm baseline builds"
if bun run typecheck 2>/dev/null; then
  echo "✅ typecheck passes"
else
  echo "⚠️  typecheck failed or script missing — continuing, but fix before Phase 1"
fi
echo ""

# --- Rename companion → steel ---------------------------------------------

echo "🏷️  Renaming companion → steel"

# package.json name
if [ -f "package.json" ]; then
  # Use node to safely edit JSON (works cross-platform, preserves formatting)
  bun -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (pkg.name && pkg.name.includes('companion')) {
      pkg.name = pkg.name.replace(/the-vibe-companion|companion/gi, 'steel');
    } else {
      pkg.name = 'steel';
    }
    if (pkg.bin) {
      const newBin = {};
      for (const [k, v] of Object.entries(pkg.bin)) {
        newBin[k.replace(/the-vibe-companion|companion/gi, 'steel')] = v;
      }
      pkg.bin = newBin;
    }
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
  "
  echo "  ✓ package.json renamed"
fi

# Config directory references: ~/.companion/ → ~/.steel/
# Only touch .ts, .tsx, .js, .md, .json source files. Skip node_modules & .git.
echo "  ↻ Replacing ~/.companion/ → ~/.steel/ across source"
grep -rl --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.md" --include="*.json" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  "\.companion" . 2>/dev/null | while read -r file; do
  # BSD sed (macOS) and GNU sed both accept -i with empty string argument via workaround
  if sed --version >/dev/null 2>&1; then
    # GNU sed
    sed -i 's|\.companion|.steel|g' "$file"
  else
    # BSD sed (macOS)
    sed -i '' 's|\.companion|.steel|g' "$file"
  fi
done

# Env var COMPANION_AUTH_TOKEN → STEEL_AUTH_TOKEN
echo "  ↻ Replacing COMPANION_AUTH_TOKEN → STEEL_AUTH_TOKEN"
grep -rl --include="*.ts" --include="*.tsx" --include="*.js" --include="*.md" --include="*.example" \
  --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist \
  "COMPANION_AUTH_TOKEN" . 2>/dev/null | while read -r file; do
  if sed --version >/dev/null 2>&1; then
    sed -i 's|COMPANION_AUTH_TOKEN|STEEL_AUTH_TOKEN|g' "$file"
  else
    sed -i '' 's|COMPANION_AUTH_TOKEN|STEEL_AUTH_TOKEN|g' "$file"
  fi
done

echo "  ✓ Source references updated"
echo ""

# --- CLAUDE.md symlink -----------------------------------------------------

echo "🔗 Setting up CLAUDE.md → STEEL.md symlink"
if [ -L "CLAUDE.md" ]; then
  echo "  ✓ symlink already exists"
elif [ -f "CLAUDE.md" ]; then
  echo "  ⚠️  CLAUDE.md exists as a regular file. Backing up to CLAUDE.md.bak"
  mv CLAUDE.md CLAUDE.md.bak
  ln -s STEEL.md CLAUDE.md
  echo "  ✓ symlink created"
else
  ln -s STEEL.md CLAUDE.md
  echo "  ✓ symlink created"
fi
echo ""

# --- .gitignore sanity check ----------------------------------------------

echo "🔒 Checking .gitignore has essentials"
for entry in "node_modules/" "dist/" ".env" ".env.local" "*.log"; do
  if ! grep -qxF "$entry" .gitignore 2>/dev/null; then
    echo "$entry" >> .gitignore
    echo "  ➕ added $entry"
  fi
done
echo "  ✓ .gitignore OK"
echo ""

# --- Commit bootstrap ------------------------------------------------------

echo "💾 Committing Phase 0 bootstrap"
git add -A
git status --short
echo ""

read -rp "Commit these changes as 'chore: phase 0 bootstrap — fork rename companion → steel'? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  git commit -m "chore: phase 0 bootstrap — fork rename companion → steel

- Renamed package identifiers to steel
- Swapped ~/.companion/ → ~/.steel/ in source references
- Swapped COMPANION_AUTH_TOKEN → STEEL_AUTH_TOKEN
- Added CLAUDE.md → STEEL.md symlink
- Added upstream remote pointing at The-Vibe-Company/companion
- Ensured .gitignore covers node_modules, dist, .env, logs"
  echo ""
  echo "✅ Phase 0 bootstrap committed"
else
  echo "⏸  Bootstrap prepared but not committed. Review with 'git diff --cached' then commit manually."
fi

echo ""
echo "=========================="
echo "🎉 Phase 0 done."
echo ""
echo "Next steps:"
echo "  1. bun run dev        # spin up Steel, open localhost:5174"
echo "  2. Spawn a session and run the smoke test (see STEEL.md → Verification)"
echo "  3. Open a Claude Code session at this repo and say:"
echo "     \"Read STEEL.md, then begin Phase 1 with the first unchecked item.\""
echo ""
echo "Steel will start building itself from here."
