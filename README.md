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
        "github:kerfich/athlete-context-mcp#v0.1.0",
        "athlete-context-mcp"
      ]
    }
  }
}
```

**Notes:**
- Remplacer `kerfich/athlete-context-mcp` par votre GitHub org/repo.
- Remplacer `v0.1.0` par un tag/release ou commit SHA pour reproductibilité (**recommandé**).
- Alternative: `github:kerfich/athlete-context-mcp#main` pour toujours utiliser la branche main (moins stable).
- **Prérequis**: Node 20+ installé localement.

Redémarrer Claude Desktop après la modification.

## Déploiement

### Publier une release

```bash
npm version patch  # ou minor / major
git push origin main --follow-tags
```

Créer une release GitHub correspondante au tag pour distribution via `npx`.
