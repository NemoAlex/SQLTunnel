# Déployer SQLTunnel avec Docker

Le service SQLTunnel sans interface est publié sur [Docker Hub](https://hub.docker.com/r/nemoalex/sqltunnel) pour les déploiements de longue durée sur serveurs et appareils NAS.

## Préparer la configuration

Créez un fichier `compose.yaml` dans le répertoire de déploiement:

```yaml
services:
  sqltunnel:
    image: nemoalex/sqltunnel:latest
    container_name: sqltunnel
    restart: unless-stopped
    ports:
      - "3000:3000"
    volumes:
      - ./config:/app/config:ro
```

Dans le mappage de port, le premier `3000` est le port hôte accessible extérieurement et le second est le port du conteneur.

Utilisez cette structure de répertoire de configuration:

```text
config/
├── gateway.yaml       # Configuration principale de SQLTunnel
└── ssh/               # Optionnel : utilisé pour les connexions par tunnel SSH
    ├── config          # Optionnel : SSH Config, alias Host et ProxyJump
    └── id_rsa          # Optionnel : clé privée SSH
```

Le répertoire `ssh/` est optionnel. Les connexions directes à la base de données nécessitent uniquement `gateway.yaml`.

Téléchargez le modèle de configuration:

```bash
mkdir config
curl -fsSL https://raw.githubusercontent.com/NemoAlex/SQLTunnel/main/config/gateway.example.yaml \
  -o config/gateway.yaml
```

Modifiez `config/gateway.yaml` pour votre environnement. Consultez la [référence de configuration](configuration.md) pour les connexions aux bases de données, les tunnels SSH et les permissions des clients.

## Démarrer le service

```bash
docker compose up -d
```

Vérifiez que le service fonctionne:

```bash
docker compose ps
docker compose logs -f sqltunnel
curl http://127.0.0.1:3000/health
```

## Notes sur le conteneur

- `127.0.0.1` dans `gateway.yaml` fait référence au conteneur SQLTunnel, et non à l'hôte.
- Placez la config SSH et les clés privées sous `config/ssh/`, puis référencez-les avec des chemins relatifs dans `gateway.yaml`. Le répertoire `config` complet est monté en lecture seule sous `/app/config`.
- `gateway.yaml` contient les mots de passe des bases de données et les clés API des clients. Ne l'ajoutez pas au contrôle de version et restreignez ses permissions de lecture.
- Lorsque vous exposez le service à distance, utilisez un proxy inverse avec HTTPS. N'exposez pas les ports des bases de données sur Internet.
