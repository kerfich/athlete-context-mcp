# athlete-context-mcp

Serveur MCP (Model Context Protocol) qui fournit le contexte athlète (profil, objectifs, policies), stocke des notes de ressenti liées aux activités Garmin et maintient un état synthétique.

## Installation locale

```bash
npm install
npm run build
npm start
```

## Dev

```bash
npm run dev
```

## Architecture

Le serveur utilise:
- **SDK officiel**: `@modelcontextprotocol/sdk` (v1.25.3) pour l'API de gestion des tools et le transport stdio
- **Transport**: stdio (newline-delimited JSON-RPC 2.0), compatible Claude Desktop
- **Validation**: `zod` pour tous les inputs et schémas JSON
- **Stockage**: SQLite local (`./data/athlete.db`, auto-migré au démarrage)
- **Extraction**: heuristique déterministe (pas d'appels LLM)

## Protocole MCP (JSON-RPC 2.0)

Le serveur expose les méthodes MCP standard via process stdio (une ligne JSON par message).

### Initialize (handshake)

**Request:**
```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"client","version":"1.0"}}}
```

**Response:**
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"athlete-context-mcp","version":"0.1.0"}}}
```

### ListTools

**Request:**
```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

**Response:**
```json
{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"get_profile","description":"Get athlete profile (versioned)","inputSchema":{}},{"name":"add_note","description":"Add a note linked to a Garmin activity","inputSchema":{...}},...]}}
```

## Tools - Exemples complets

### 1. add_note

**Description**: Ajouter une note liée à une activité Garmin avec extraction automatique.

**Request:**
```json
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"add_note","arguments":{"activity_id":"run_20260128_morning","note_text":"RPE 7, stress 6/10, sommeil 5/10, douleur légère mollet 3/10, seul","note_date":"2026-01-28","tags":["recovery","easy"]}}}
```

**Response:**
```json
{"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"json","json":{"note_id":1,"activity_id":"run_20260128_morning","extracted":{"rpe":7,"stress":6,"sleep_quality":5,"social_context":"solo","pain":[{"area":"mollet","intensity":3}],"raw_text":"RPE 7, stress 6/10, sommeil 5/10, douleur légère mollet 3/10, seul"},"created_at":"2026-01-28T10:30:00.000Z"}}]}}
```

### 2. get_state

**Description**: Récupérer l'état synthétique de l'athlète calculé à partir des notes.

**Request:**
```json
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_state","arguments":{}}}
```

**Response:**
```json
{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"json","json":{"state":{"stress_trend_7d":5.5,"rpe_trend_7d":6.2,"pain_watchlist":[{"area":"mollet","occurrences":2,"avg_intensity":3}],"solo_ratio_14d":0.75,"readiness_subjective":72,"flags":["high_stress"]},"version":1,"updated_at":"2026-01-28T10:30:00.000Z"}}]}}
```

### 3. search_notes

**Description**: Rechercher des notes par requête texte avec filtres optionnels.

**Request:**
```json
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"search_notes","arguments":{"query":"mollet","since":"2026-01-20","until":"2026-01-28","limit":10}}}
```

**Response:**
```json
{"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"json","json":{"results":[{"id":1,"activity_id":"run_20260128_morning","note_date":"2026-01-28","raw_text":"RPE 7, stress 6/10, sommeil 5/10, douleur légère mollet 3/10, seul","tags":["recovery","easy"],"extracted":{"rpe":7,"stress":6,"sleep_quality":5,"social_context":"solo","pain":[{"area":"mollet","intensity":3}],"raw_text":"..."},"created_at":"2026-01-28T10:30:00.000Z"}]}}]}}
```

## Autres Tools

- `get_profile()` / `upsert_profile(profile)` — Profil athlète (versioned)
- `get_goals()` / `upsert_goals(goals)` — Objectifs (versioned)
- `get_policies()` / `upsert_policies(policies)` — Policies (versioned)
- `get_note(activity_id)` — Récupérer une note par activité
- `update_state()` — Recalculer l'état de l'athlète

## DB Schema

SQLite auto-migré au démarrage :

```sql
CREATE TABLE IF NOT EXISTS versions_profile (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS versions_goals (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS versions_policies (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id TEXT,
  note_date TEXT,
  raw_text TEXT,
  tags_json TEXT,
  extracted_json TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS versions_state (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);
```

## Fichier DB

- Emplacement: `./data/athlete.db`
- Créé automatiquement au premier démarrage
- Compatible avec better-sqlite3

## Extraction de notes (heuristique)

Le serveur extrait automatiquement depuis `note_text` :
- **RPE** (1-10): patterns "RPE 7", "8/10", "ressenti=6"
- **Stress** (0-10): "stress 7/10", "stress=6"
- **Sommeil** (0-10): "sommeil 5/10"
- **Contexte social**: enum (solo, couple, amis, club, unknown) via mots-clés
- **Douleur**: zones + intensité via mots-clés (mollet, genou, tibia, tendon, fesse, dos, cheville, épaule)

Exemple texte:
```
"RPE 7, stress 6/10, sommeil 5/10, mollet 3/10, seul"
```

Extracted:
```json
{
  "rpe": 7,
  "stress": 6,
  "sleep_quality": 5,
  "social_context": "solo",
  "pain": [{"area": "mollet", "intensity": 3}],
  "raw_text": "RPE 7, stress 6/10, sommeil 5/10, mollet 3/10, seul"
}
```

## État synthétique (athlete_state)

Calculé à partir des notes passées (14 jours par défaut) :

- **stress_trend_7d**: moyenne glissante stress (7 jours)
- **rpe_trend_7d**: moyenne glissante RPE (7 jours)
- **pain_watchlist**: top 3 zones avec occurrences + intensité moyenne
- **solo_ratio_14d**: proportion d'entraînements solo
- **readiness_subjective**: score 0-100 (formule simple: 100 - 5×stress - 3×rpe - 8×pain_max)
- **flags**: ["high_stress", "pain_risk", ...] si conditions atteintes

## Intégration Claude Desktop

### Option 1: Locale (repo cloné)

Configuration `claude_desktop_config.json` (macOS: `~/Library/Application\ Support/Claude/claude_desktop_config.json`) :

```json
{
  "mcpServers": {
    "athlete": {
      "command": "node",
      "args": ["/path/to/athlete-context-mcp/dist/index.js"]
    }
  }
}
```

Puis redémarrer Claude Desktop.

### Option 2: Via npm depuis GitHub (recommandé)

Installez directement depuis GitHub (pas besoin de cloner le repo localement). Le binaire `athlete-context-mcp` est exposé via npm.

Configuration `claude_desktop_config.json` :

```json
{
  "mcpServers": {
    "athlete": {
      "command": "npx",
      "args": [
        "--yes",
        "--package",
        "github:kerfich/athlete-context-mcp#v0.2.0",
        "athlete-context-mcp"
      ]
    }
  }
}
```

**Notes:**
- Remplacer `kerfich/athlete-context-mcp` par votre GitHub org/repo.
- Remplacer `v0.2.0` par un tag/release ou commit SHA pour reproductibilité (**recommandé**).
- Alternative: `github:kerfich/athlete-context-mcp#main` pour toujours utiliser la branche main (moins stable).
- **Prérequis**: Node 20+ installé localement.

Redémarrer Claude Desktop après la modification.

### Option 3: Claude Desktop macOS avec PATH minimal

Claude Desktop s'exécute dans un environnement avec PATH limité sur macOS (Homebrew n'ajoute pas `/opt/homebrew/bin` par défaut). Si vous recevez une erreur `command not found: npx`, utilisez le chemin absolu vers npx ou node.

#### Configuration avec chemin absolu

Si Node 20 est installé via Homebrew:

```bash
# Trouver le chemin absolu vers npx
which npx
# Output: /opt/homebrew/bin/npx

# Ou via Homebrew
ls /opt/homebrew/opt/node@20/bin/
# Output: node  npm  npx
```

Mettez à jour `claude_desktop_config.json` avec le chemin absolu:

```json
{
  "mcpServers": {
    "athlete": {
      "command": "/opt/homebrew/opt/node@20/bin/npx",
      "args": [
        "--yes",
        "--package",
        "github:kerfich/athlete-context-mcp#v0.2.0",
        "athlete-context-mcp"
      ]
    }
  }
}
```

Ou directement avec node:

```json
{
  "mcpServers": {
    "athlete": {
      "command": "/opt/homebrew/opt/node@20/bin/node",
      "args": ["/path/to/athlete-context-mcp/dist/index.js"]
    }
  }
}
```

#### Vérifier votre configuration

```bash
# Vérifier que Node 20 est installé
node --version
# v20.x.x

# Vérifier le PATH de npx
ls -la /opt/homebrew/opt/node@20/bin/npx
# ou si vous utilisez node@latest
ls -la /opt/homebrew/bin/npx
```

Redémarrer Claude Desktop après la modification.

## Robustesse du binaire

Le binaire npm est conçu pour fonctionner dans des environnements avec PATH minimal (ex: Claude Desktop, containers, CI/CD).

### Vérifications de sécurité

Le build automatise les contrôles:

```bash
# Build compile + rend le binaire exécutable + vérifie l'intégrité
npm run build

# Verify.dist vérifie:
# 1. Présence de McpServer dans le code compilé
# 2. Permissions exécutables sur dist/index.js
npm run verify:dist
```

### Shebang et chaîne d'exécution

- ✅ Shebang `#!/usr/bin/env node` présent dans dist/index.js
- ✅ dist/index.js est exécutable (permissions 755)
- ✅ Champ "bin" du package.json: `"athlete-context-mcp": "dist/index.js"`

### Gestion des erreurs

Le serveur écrit **uniquement** sur stderr pour les logs (stdout reste propre pour JSON-RPC):

```bash
# Erreur : écrite sur stderr
athlete-context-mcp server connected on stdio

# Réponse JSON-RPC : écrite sur stdout
{"result":{"protocolVersion":"2024-11-05",...},"jsonrpc":"2.0","id":1}
```

## Déploiement

### Publier une release

```bash
npm version patch  # ou minor / major
git push origin main --follow-tags
```

Créer une release GitHub correspondante au tag pour distribution via `npx`.
## Test local

### Démarrer le serveur

```bash
npm run build
npm start
```

Le serveur écoute sur stdin/stdout et affiche les logs sur stderr:
```
athlete-context-mcp server connected on stdio
```

### Tester manuellement avec echo

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}' | node dist/index.js
```

Response:
```json
{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{}},"serverInfo":{"name":"athlete-context-mcp","version":"0.2.0"}}}
```

### Tester tools/list

```bash
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | node dist/index.js
```

## Test npx depuis GitHub

Installer et lancer la dernière version depuis GitHub:

```bash
# Depuis un tag spécifique (recommandé pour reproductibilité)
npx --yes --package github:kerfich/athlete-context-mcp#v0.2.0 athlete-context-mcp

# Ou depuis main (branche par défaut)
npx --yes --package github:kerfich/athlete-context-mcp#main athlete-context-mcp
```

Le serveur démarre et attend les requêtes JSON-RPC 2.0 sur stdin.

Pour tester une requête:
```bash
(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}'; sleep 1) | \
  npx --yes --package github:kerfich/athlete-context-mcp#main athlete-context-mcp
```