---
name: push
description: Push the current branch to GitHub (omervigder/tony-s-web) without hanging on a credential prompt, and guide the user through browser auth if the push is actually rejected. Use when the user says "push", "push it", "push my changes", or asks to get the current branch onto GitHub.
---

# Push the current branch

Get the current branch onto `origin`, failing fast and legibly instead of stalling.

## Why this exists

`git push` on this repo has a specific failure mode. The remote is
`https://omervigder@github.com/omervigder/tony-s-web.git`. If git has no usable write
credential, it does **not** error — it drops into an interactive credential prompt and
**hangs until it times out**, which looks like a broken tool rather than a permissions
problem.

## The one rule that matters

Every `git push` / `git fetch` here must disable terminal prompting:

```bash
GIT_TERMINAL_PROMPT=0 git push -u origin "$(git branch --show-current)"
```

That converts the hang into an immediate, readable auth error. Without it, the push blocks.

## Do NOT gate on `gh auth status` or `gh repo view`

This was tried and it is **wrong**. `gh`'s auth and git's credential helper are independent:
on this machine `gh repo view omervigder/tony-s-web --json viewerPermission` reports `READ`
(the `gh` CLI is signed in as a different account), while `git push` **succeeds**, because git
authenticates separately via the Windows Credential Manager as `omervigder`.

So a `gh` permission check produces a false alarm — it sends the user off to re-authenticate
when nothing is broken. **Just attempt the push.** Let the push itself be the test.

## Steps

1. **Check the branch.** If it is `main`, stop and ask first — this project's history merges
   through PRs, so a direct push to the default branch is almost certainly not intended.

2. **Push, with prompting disabled:**

   ```bash
   GIT_TERMINAL_PROMPT=0 git push -u origin "$(git branch --show-current)"
   ```

3. **If it succeeds**, report the branch and the compare/PR URL from the push output. Stop there.

4. **If and only if it fails with an auth error** (`could not read Username`, `Authentication
   failed`, `403`), go to the auth section below.

## Auth — the user must do this themselves

**Do not attempt to authenticate on the user's behalf.** Signing into an account is theirs to
do, and the login flow is interactive (it opens a browser and needs a one-time code entered),
so invoking it through a tool call will just hang.

Tell the user to run it in their own terminal with the `!` prefix, which executes it in the
session so the browser can open and the output still comes back to the conversation:

```
! gh auth login --web --hostname github.com --git-protocol https
```

They must sign in as **`omervigder`** — that is the account with write access. Say yes when it
offers to configure git's credential helper; that is the part that stops the underlying
`git push` from prompting again.

Then **wait** for them to confirm, and retry step 2. Do not assume it worked — the push
succeeding is the only proof.

## After the push

**Do not open a pull request unless the user explicitly asked for one.** "Push" means push.

If they do want a PR, keep the body strictly about the code. Never put the Firebase project id,
deploy state, environment values, or other infrastructure identifiers into a PR description —
this repo is public.

## Secrets

`.env.local` holds live credentials and is gitignored (as is `.env*`). Never stage, commit, or
print the contents of those files. If a push is ever rejected for containing a secret, stop and
surface it rather than rewriting history to force it through.
