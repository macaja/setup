# media

Self-hosted movies and series: you ask for a film in Jellyseerr, Radarr or Sonarr
goes looking for it through Prowlarr, qBittorrent downloads it behind a VPN, and
Jellyfin plays it.

## Pieces

| Container | Port | What it does |
| --- | --- | --- |
| gluetun | — | VPN tunnel. Publishes qBittorrent's port on its behalf. |
| qbittorrent | 8080 | Torrent client, running inside gluetun's network. |
| prowlarr | 9696 | Indexer list, shared with Radarr and Sonarr. |
| radarr | 7878 | Movie automation. |
| sonarr | 8989 | Series automation. |
| jellyfin | 8096 | The player. |
| jellyseerr | 5055 | Where you request what you want to watch. |

`network_mode: "service:gluetun"` means qBittorrent has no network of its own —
it uses the VPN container's. If the tunnel drops, qBittorrent loses internet
access instead of falling back to your normal connection.

Radarr, Sonarr and Prowlarr do **not** go through the VPN: they talk to indexers
over HTTPS and need to reach qBittorrent and the LAN. To tunnel them too, give
them the same `network_mode` and move their ports into gluetun's `ports` block.

## Running it

```sh
cd media
cp .env.example .env   # then fill it in
docker compose up -d
docker compose logs -f gluetun   # confirm the tunnel came up before going on
```

Needs Docker with `/dev/net/tun` support: built in on Linux, provided by Docker
Desktop on Mac.

## The data tree

`DATA_ROOT` is a single directory that qBittorrent, Radarr and Sonarr all see at
the same path (`/data`). That is what lets a finished download move into the
library as a hardlink instead of a copy — instant, and no duplicated space. If
each container mounts different paths, every movie costs you twice the disk.

```
$DATA_ROOT/
├── torrents/     # in-progress downloads (qBittorrent writes here)
│   ├── movies/
│   └── tv/
└── media/        # final library (Jellyfin reads here)
    ├── movies/
    └── tv/
```

Create it before the first start:

```sh
mkdir -p "$DATA_ROOT"/{torrents/{movies,tv},media/{movies,tv}}
```

## Setup after the first start

None of this can live in the compose file — it has to be done through each web UI:

1. **qBittorrent** (`localhost:8080`): user `admin`, temporary password shows up
   in `docker compose logs qbittorrent`. Change it. Point the download folder at
   `/data/torrents`.
2. **Prowlarr** (`localhost:9696`): add indexers, then Settings → Apps → add
   Radarr and Sonarr. Between containers the URLs are `http://radarr:7878` and
   `http://sonarr:8989`, not `localhost`.
3. **Radarr** (`localhost:7878`) and **Sonarr** (`localhost:8989`): root folders
   `/data/media/movies` and `/data/media/tv`. Under Download Clients add
   qBittorrent with host `gluetun` and port `8080` — from inside the Docker
   network qBittorrent answers on the VPN container's name, because that is
   where its network lives.
4. **Jellyfin** (`localhost:8096`): libraries pointing at `/data/media/movies`
   and `/data/media/tv`.
5. **Jellyseerr** (`localhost:5055`): connect it to Jellyfin, Radarr and Sonarr
   using those same container URLs.

## Secrets

VPN credentials live in `media/.env`, which is gitignored along with
`media/config/`. Only the compose file and `.env.example` are committed.
