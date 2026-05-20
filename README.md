# athlete-context-mcp — v0.3.0

Serveur MCP (Model Context Protocol) qui persiste le contexte d'un athlète
triathlon entre les conversations Claude : profil physiologique, objectifs
de saison, politiques d'entraînement, état quotidien et journal de notes.

---

## Sommaire

- [Installation](#installation)
- [Configuration Claude Desktop](#configuration-claude-desktop)
- [Tools disponibles](#tools-disponibles)
- [Schémas de données](#schémas-de-données)
- [Base de données SQLite](#base-de-données-sqlite)
- [Extraction automatique des notes](#extraction-automatique-des-notes)
- [Débogage](#débogage)

---

## Installation

```bash
git clone https://github.com/kerfich/athlete-context-mcp
cd athlete-context-mcp
npm install
npm run build        # compile TypeScript → dist/
```

Prérequis : **Node 20+**.

---

## Configuration Claude Desktop

Fichier : `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)

### Configuration recommandée (build local)

```json
{
  "mcpServers": {
    "athlete": {
      "command": "/bin/bash",
      "args": [
        "-lc",
        "exec 2>>\"$HOME/athlete-mcp.log\"; export PATH=/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; export ATHLETE_MCP_DATA_DIR=\"$HOME/Library/Application Support/athlete-context-mcp\"; /opt/homebrew/opt/node@20/bin/node /CHEMIN/VERS/athlete-context-mcp/dist/index.js"
      ]
    }
  }
}
```

Remplacer `/CHEMIN/VERS/athlete-context-mcp` par le chemin absolu du repo cloné.

Redémarrer Claude Desktop après modification.

### Avec mode debug

```json
{
  "mcpServers": {
    "athlete_debug": {
      "command": "/bin/bash",
      "args": [
        "-lc",
        "exec 2>>\"$HOME/athlete-mcp-debug.log\"; export PATH=/opt/homebrew/opt/node@20/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin; export MCP_DEBUG=1; export ATHLETE_MCP_DATA_DIR=\"$HOME/Library/Application Support/athlete-context-mcp-debug\"; /opt/homebrew/opt/node@20/bin/node /CHEMIN/VERS/athlete-context-mcp/dist/index.js"
      ]
    }
  }
}
```

### Variable d'environnement

| Variable | Défaut (macOS) | Description |
|----------|---------------|-------------|
| `ATHLETE_MCP_DATA_DIR` | `~/Library/Application Support/athlete-context-mcp` | Répertoire de la base SQLite |
| `MCP_DEBUG` | — | `1` pour activer les logs internes |

---

## Tools disponibles

### Bootstrap

#### `get_context` ⭐
Appel de démarrage de conversation. Retourne en une seule requête :
profil + objectifs + politiques + état courant + 3 dernières notes.

```json
{}
```

---

### Profil

#### `get_athlete_profile`
Retourne le profil complet (versioned).

```json
{}
```

#### `upsert_athlete_profile`
Crée ou met à jour le profil. Tous les champs sont optionnels ; seuls les
champs envoyés sont persistés (merge avec Zod strip).

Champs de premier niveau :

| Champ | Type | Description |
|-------|------|-------------|
| `name` | string | Prénom / nom |
| `age` | integer | Âge |
| `weight_kg` | number | Poids en kg |
| `hr_max` | integer | FC max (bpm) |
| `lthr_run` | integer | LTHR course (bpm) |
| `ftp_bike_ref` | integer | FTP vélo référence (W) |
| `ftp_bike_current` | integer | FTP vélo actuel (W) |
| `hr_zones_run` | HRZone[] | 7 zones FC course |
| `hr_zones_bike` | HRZone[] | 7 zones FC vélo |
| `pace_zones_run` | PaceZone[] | 5 zones allure course |
| `biomechanics_targets` | object | Cibles biomécaniques (cadence, GCT, OV, VR) |
| `injury_history` | Injury[] | Antécédents médicaux |
| `training_pattern` | object | Jours d'entraînement habituels |
| `equipment` | object | Matériel disponible |
| `schedule_constraints` | object | Contraintes planning hebdo |
| `session_naming_convention` | object | Règle de nommage des séances |
| `training_volume_targets` | object | Volumes et fréquences cibles |
| `constraints` | string[] | Contraintes libres |

**`equipment`** :
```
bike_name, shoes_run_name, wetsuit (bool), power_meter (bool),
heart_rate_monitor (bool), smart_trainer (bool), swim_goggles (bool), notes
```

**`schedule_constraints`** :
```
available_days (string[]), unavailable_days (string[]),
preferred_time (morning|midday|evening|flexible),
max_session_duration_min, min_rest_days_per_week, notes
```

**`session_naming_convention`** :
```
format (e.g. "{date}_{discipline}_{type}_{duration}min"),
prefix, date_format, discipline_codes (record string→string), example, notes
```

**`training_volume_targets`** :
```
weekly_run_km, weekly_bike_km, weekly_swim_m,
sessions_per_week_run, sessions_per_week_bike, sessions_per_week_swim,
long_run_km, long_bike_km, phase, notes
```

---

### Objectifs

#### `get_athlete_goals`
Retourne les objectifs de saison (versioned).

#### `upsert_athlete_goals`

```
events: Event[]          — Liste des courses/épreuves
  name, date (YYYY-MM-DD), discipline (run|triathlon|swim|bike|vtt)
  priority (A|B|C), target_time?, notes?
current_phase?:
  code (P0|P1|P2…), description, start_date, current_week,
  target_weekly_volume_km
season_notes?
```

---

### Politiques

#### `get_athlete_policies`
Retourne les règles d'entraînement actives (versioned).

#### `upsert_athlete_policies`

```
rules: PolicyRule[]
  id, description, condition?, action?,
  severity (info|warn|block)
```

---

### État quotidien

#### `get_athlete_state`
Retourne l'état courant : métriques calculées depuis les notes + dernière
évaluation subjective.

#### `update_athlete_state`
Enregistre l'état subjectif du jour et recalcule les métriques.

```
ankle_pain      0–10   Douleur cheville
fatigue         0–10   Fatigue subjective
sleep_quality   0–10   Qualité sommeil
comment?               Commentaire libre
```

Métriques calculées (14 derniers jours de notes) :
- `stress_trend_7d`, `rpe_trend_7d`
- `pain_watchlist` : top 3 zones douloureuses (occurrences + intensité moyenne)
- `solo_ratio_14d`
- `readiness_subjective` 0–100 : `100 - 5×stress - 3×rpe - 8×pain_max`
- `flags` : `high_stress`, `pain_risk`

---

### Notes

#### `add_note`
Ajoute une note (analyse de séance, bilan hebdo, décision planning).

```
note_text*    string   Contenu complet (requis, minLength: 1)
note_date?    string   YYYY-MM-DD (défaut: aujourd'hui)
type?         enum     analyse_seance | bilan_semaine | decision_plan
                       | state_update | general
tags?         string[] Ex: ["run", "vélo", "récupération"]
activity_id?  string   ID activité Garmin (optionnel)
```

Retourne `note_id` (entier) pour récupération ultérieure.

L'extraction automatique analyse `note_text` pour en extraire :
RPE, stress, sommeil, contexte social, zones douloureuses.

#### `get_note`
Récupère une note par son identifiant numérique.

```
note_id   integer   ID retourné par add_note
```

#### `search_notes`
Recherche des notes avec filtres combinables.

```
query?      string   Recherche plein texte
date_from?  string   YYYY-MM-DD
date_to?    string   YYYY-MM-DD
type?       enum     (voir add_note)
tags?       string[] Filtre par tags (matching OR)
limit?      integer  Défaut 10
```

---

## Schémas de données

### HRZone
```
zone (1–7), name?, min_bpm?, max_bpm?
```

### PaceZone
```
zone (1–5), name?, min_pace_per_km? ("mm:ss"), max_pace_per_km?
```

### Injury
```
area, description?, start_date?, end_date?, severity (0–10)?
```

### Extraction automatique (note_text)

| Champ extrait | Patterns reconnus |
|--------------|-------------------|
| `rpe` 1–10 | `RPE 7`, `8/10`, `ressenti=6` |
| `stress` 0–10 | `stress 6/10`, `stress=4` |
| `sleep_quality` 0–10 | `sommeil 7/10`, `sleep=8` |
| `social_context` | `seul/solo` → solo, `couple` → couple, `amis` → amis, `club` → club |
| `pain[].area` | mollet, genou, tibia, tendon, fesse, dos, cheville, épaule |
| `pain[].intensity` | chiffre `/10` ou `= N` après le nom de la zone |

---

## Base de données SQLite

Chemin par défaut (macOS) : `~/Library/Application Support/athlete-context-mcp/athlete.db`

Créée et migrée automatiquement au démarrage.

```sql
CREATE TABLE IF NOT EXISTS versions_profile
  (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS versions_goals
  (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS versions_policies
  (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS versions_state
  (id INTEGER PRIMARY KEY, version INTEGER, json TEXT, updated_at TEXT);

CREATE TABLE IF NOT EXISTS notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_id   TEXT,
  note_date     TEXT,
  type          TEXT,        -- migration automatique sur ancienne DB
  raw_text      TEXT,
  tags_json     TEXT,
  extracted_json TEXT,
  created_at    TEXT
);
```

Les tables `versions_*` stockent un unique enregistrement `id=1` avec :
- `version` : incrémenté à chaque `upsert`
- `json` : données sérialisées
- `updated_at` : ISO 8601

### Robustesse SQLite (multi-instances)

- WAL (`journal_mode = WAL`) pour lectures concurrentes
- `busy_timeout = 5000ms`
- Retry exponentiel sur `SQLITE_BUSY/SQLITE_LOCKED` : 5 tentatives, backoff 50→100→200→300→500 ms

---

## Débogage

```bash
# Logs dans ~/athlete-mcp.log
tail -f ~/athlete-mcp.log

# Mode debug (logs SQLite + répertoire de données)
MCP_DEBUG=1 node dist/index.js

# Test d'initialisation
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | node dist/index.js

# Liste des tools
echo '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | node dist/index.js | python3 -m json.tool
```

---

## Architecture

| Fichier | Rôle |
|---------|------|
| `src/index.ts` | Enregistrement des tools MCP, transport stdio |
| `src/models.ts` | Schémas Zod (profil, objectifs, politiques, notes, état) |
| `src/tools.ts` | Implémentations CRUD (SQLite) |
| `src/state.ts` | Calcul des métriques dérivées depuis les notes |
| `src/extractor.ts` | Extraction heuristique depuis `note_text` |
| `src/db.ts` | Initialisation SQLite, migrations, retry |

**Note technique** — `inputSchema` : les schémas Zod passés à `server.tool()` utilisent
`.shape` (objet brut `{ clé: ZodType }`) et non l'instance `ZodObject` directement.
Le SDK MCP v1.25+ détecte les instances ZodObject et les traite comme `annotations`,
laissant `inputSchema` vide — ce qui ferait échouer tous les appels.

---

## Changelog

### v0.3.0
- **Fix critique** : `inputSchema` correctement exposé (`.shape` au lieu de `ZodObject`)  
  → les arguments sont désormais reçus et persistés dans les handlers
- **Nouveau tool** : `get_context` — bootstrap en un appel (profil + objectifs + politiques + état + 3 notes)
- **`add_note`** : champ `type` (enum), `activity_id` optionnel, guard `note_text`
- **`update_athlete_state`** : évaluation subjective (ankle_pain, fatigue, sleep_quality, comment)
- **`search_notes`** : filtres date_from/date_to, type, tags
- **`upsert_athlete_profile`** : 4 nouveaux champs — `equipment`, `schedule_constraints`, `session_naming_convention`, `training_volume_targets`
- Migration DB automatique : colonne `type` sur la table `notes`
- Guards défensifs dans `add_note` et `extractFromText`

### v0.2.2
- Data directory configurable via `ATHLETE_MCP_DATA_DIR`
- Support macOS `~/Library/Application Support`

### v0.2.0
- Transport stdio, SDK MCP officiel
- Tools : get/upsert profil, objectifs, politiques, notes, état
