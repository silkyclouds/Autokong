# Déploiement et tests sur Unraid

## Sur le serveur Unraid (SSH ou terminal)

### 1. Arrêter et supprimer l’ancien conteneur

```bash
docker stop autokong
docker rm autokong
```

### 2. Récupérer la nouvelle image

```bash
docker pull meaning/autokong:latest
```

### 3. Recréer et lancer le conteneur

```bash
docker run -d --name autokong \
  -p 5000:5000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /mnt/downloads_cache/MURRAY/Music:/mnt/downloads_cache/MURRAY/Music \
  -v /mnt/cache/appdata/songkong:/songkong \
  -v autokong_data:/app/data \
  meaning/autokong:latest
```

Si tu utilises un volume nommé différent pour les données (ex. `/mnt/user/appdata/autokong`), remplace la ligne `-v autokong_data:/app/data` par :

```bash
  -v /mnt/user/appdata/autokong:/app/data \
```

### 4. Vérifier que le conteneur tourne

```bash
docker ps | grep autokong
docker logs autokong --tail 20
```

---

## Comment tester

### 1. WebUI

- Ouvre **http://&lt;IP_UNRAID&gt;:5000** (ex. http://192.168.3.2:5000).
- Tu dois voir la page d’accueil Autokong avec les liens Run, Historique, Planification, Configuration SongKong.

### 2. Santé (Health)

- Dans la WebUI, vérifie qu’une bannière ou un indicateur “ok” s’affiche (si implémenté).
- Ou en direct : **http://&lt;IP_UNRAID&gt;:5000/api/health**  
  Réponse attendue : `{"ok": true, "checks": {...}}` avec `host_root` et `songkong_prefs_dir` à `true`.

### 3. Configuration SongKong

- Va sur **Configuration SongKong**.
- **Liste des fichiers** : tu dois voir les fichiers `.properties` (ex. songkong_fixsongs4.properties, songkong_bandcamp.properties, etc.).
- **Fichier par tâche** : pour chaque tâche (MusicBrainz, Bandcamp, Suppression doublons, Renommage), un menu déroulant doit proposer ces fichiers ; choisis un fichier puis clique sur **Enregistrer la configuration**.
- **Éditeur** : sélectionne un fichier dans la liste, clique **Charger**, modifie le contenu (par ex. un commentaire), clique **Enregistrer le fichier**, puis recharge : les changements doivent être visibles.

### 4. Aperçu (Preview)

- Va sur **Run** (ou appelle **http://&lt;IP_UNRAID&gt;:5000/api/preview?scope=daily**).
- Vérifie que l’aperçu des dossiers à traiter s’affiche (ou un message “no folders” si aucun dossier du jour n’existe).

### 5. Lancer un run (optionnel)

- Sur la page **Run**, garde les étapes par défaut (ou désactive tout sauf une étape légère si tu veux limiter l’impact).
- Choisis un scope (ex. **daily**).
- Clique sur **Lancer**. Un `job_id` doit apparaître et les logs défiler.
- Dans **Historique**, le run doit apparaître avec son statut et son résumé.

### 6. API rapide (curl)

```bash
# Health
curl -s http://192.168.3.2:5000/api/health | jq

# Liste des .properties
curl -s http://192.168.3.2:5000/api/songkong-config/list | jq

# Config
curl -s http://192.168.3.2:5000/api/config | jq
```

Remplacer `192.168.3.2` par l’IP de ton Unraid si besoin.
