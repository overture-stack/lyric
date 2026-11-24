# Roadmap: file-based configuration for apps/server, mirroring Arranger

`apps/server`'s config is env-var only today. Add a file layer like Arranger's search-server: defaults → env vars → optional config file, each overriding the last, before the merged result reaches `provider()`. Needs a decision on file format/location and confirmation against Arranger's actual behaviour. `packages/data-provider` keeps receiving typed config as parameters regardless; this is purely an `apps/server` change.
