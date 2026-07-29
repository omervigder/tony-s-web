# Tony

Hebrew/RTL e-commerce store. React 19 + TypeScript + Tailwind v4 + Vite + Firebase.

## Pushing

The remote is `https://omervigder@github.com/omervigder/tony-s-web.git`, and **the repo is
public**.

Push with prompting disabled, or a missing credential will hang instead of erroring:

```bash
GIT_TERMINAL_PROMPT=0 git push -u origin "$(git branch --show-current)"
```

Known trap on this machine: `gh repo view omervigder/tony-s-web --json viewerPermission`
reports `READ` because the `gh` CLI is signed in as a *different* account — but `git push`
still works, authenticating separately via the Windows Credential Manager as `omervigder`.
**Never gate a push on `gh`'s permission check**; it is a false alarm. Attempt the push and let
that be the test. If it genuinely fails on auth, ask the user to run
`! gh auth login --web` themselves and sign in as `omervigder`.

There is also a `/push` skill (`.claude/skills/push/`) that wraps all of this.

**Branch, don't push to `main`** — history here merges through PRs. And "push" means push:
don't open a PR unless asked. If asked, keep the body about the code — never put the Firebase
project id, deploy state, or env values into a PR description on this public repo.

## Secrets

`.env.local` holds live Firebase/Telegram/Gemini credentials and is gitignored (as is `.env*`).
Never stage, commit, or print its contents. If a push is rejected for containing a secret, stop
and surface it rather than rewriting history to force it through.

## Deploys

Firebase project is a single project (see `.firebaserc`); `tony-amramy-branding` is a *hosting
site name* inside it, not a separate project.

```bash
npm run build && npx firebase deploy --only hosting
npx firebase deploy --only firestore:rules
npx firebase deploy --only functions
```

Deploying is outward-facing — confirm with the user first unless they asked for it.

## Conventions

- `npm run lint` is `tsc --noEmit`; keep it clean.
- Theme lives in `src/index.css` as Tailwind v4 `@theme` tokens (`cream`, `ink`, `surface`,
  `sand`, `body`, `muted`, `line`). There is **no `tailwind.config.js`**. Use the tokens —
  don't hardcode hex.
- `/logo.jpeg` renders with `mixBlendMode: multiply`, so it cannot sit on a dark background.
- `src/pages/Admin.tsx` imports its types from `src/types.ts`. Don't reintroduce local
  duplicates — that's how the two drifted apart before.
- Firestore rejects `undefined`. Optional fields on writes must use conditional spread.
