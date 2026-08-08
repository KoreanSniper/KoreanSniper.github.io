# BlockRail V2

Experimental rebuild of the BlockRail site.

## Rules
- `main` is the production site and is not modified by this rebuild.
- This branch contains the new architecture under `v2/`.
- Existing features are migrated one subsystem at a time.
- No legacy file is deleted until the replacement has been verified.

## Target architecture

```text
v2/
├─ core/
│  ├─ firebase/
│  ├─ auth/
│  ├─ audit/
│  ├─ utils/
│  └─ ui/
├─ pages/
│  ├─ home/
│  ├─ community/
│  ├─ arcade/
│  ├─ train-map/
│  └─ history/
├─ admin/
├─ games/
├─ server/
└─ assets/
```

The first milestone is a clean shell plus a single Firebase entry point. Legacy community code remains untouched while migration is underway.
