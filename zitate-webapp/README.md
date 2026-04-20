# Zitate-Webapp

Kleine Node.js-Webapp zum Erfassen von Zitaten und Schreiben in einen Obsidian-kompatiblen Markdown-Vault.

## Lokal starten

```powershell
npm start
```

Danach im Browser öffnen:

```text
http://localhost:5174
```

## Wichtige Umgebungsvariablen

Siehe auch `.env.example`.

```text
PORT=5174
VAULT_DIR=/absoluter/pfad/zum/Zitate-Archiv
ACCESS_CODE=ein-geheimer-zugangscode
GITHUB_TOKEN=
GITHUB_REPO=beriawenCloud/Zitate
GITHUB_BRANCH=main
GITHUB_VAULT_PATH=Zitate-Archiv
```

`ACCESS_CODE` sollte online immer gesetzt werden. Ohne `ACCESS_CODE` kann jeder, der die Seite erreicht, Zitate speichern.

Wenn `GITHUB_TOKEN` gesetzt ist, schreibt die App nicht lokal in `VAULT_DIR`, sondern direkt in das GitHub-Repository. Ohne `GITHUB_TOKEN` bleibt der lokale Markdown-Modus aktiv.

## GitHub-Modus

Für dein Repository:

```text
GITHUB_REPO=beriawenCloud/Zitate
GITHUB_BRANCH=main
GITHUB_VAULT_PATH=Zitate-Archiv
```

Der Token muss Schreibrechte auf Repository-Inhalte haben. Bei einem Fine-grained Personal Access Token reicht normalerweise:

- Repository: `beriawenCloud/Zitate`
- Permission: `Contents` mit `Read and write`

Die App liest die jeweilige Kategorie-Datei aus GitHub, hängt den neuen Markdown-Block an und speichert die Datei als Commit zurück.

## Deployment auf einem Node.js-Server

1. Ordner `zitate-webapp` auf den Server kopieren.
2. Node.js installieren.
3. Den Vault-Ordner auf dem Server anlegen oder `GITHUB_TOKEN` für den GitHub-Modus setzen.
4. Umgebungsvariablen setzen:

```bash
export PORT=5174
export ACCESS_CODE='dein-geheimer-code'
export GITHUB_TOKEN='github_pat_...'
export GITHUB_REPO='beriawenCloud/Zitate'
export GITHUB_BRANCH='main'
export GITHUB_VAULT_PATH='Zitate-Archiv'
```

5. App starten:

```bash
npm start
```

Für dauerhaften Betrieb empfiehlt sich ein Prozessmanager wie `pm2` oder ein systemd-Service. Vor die App sollte außerdem HTTPS über den Webserver oder Reverse Proxy, z. B. Nginx, Apache oder Plesk.

## Speicherprinzip

Die App nutzt keine externe Datenbank. Sie schreibt fertige Markdown-Blöcke direkt in die Kategorie-Dateien des Vaults. Das hält das Archiv Obsidian-kompatibel und leicht portierbar.
