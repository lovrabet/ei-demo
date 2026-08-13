---
name: lovrabet-cdn-menu-release
displayName: 企业智能系统前端发布
description: "发布启智云图企业智能系统微前端时使用：更新版本、构建生产资源、上传 CDN、更新或同步 Lovrabet 菜单、验证线上资源，并仅在用户明确授权后提交或推送代码。"
example: "发布启智云图企业智能系统前端并更新菜单资源"
metadata:
  type: write
---

# Lovrabet CDN Menu Release

## Overview

Run Lovrabet micro-frontend releases as a guarded sequence: verify code, build versioned CDN assets, upload, dry-run menu resource changes, update menus, verify online state, then commit/push only when explicitly requested.

## Hard Rules

- Do not publish CDN, update/sync menus, or git push unless the user explicitly authorizes those actions in the current turn.
- Use the `rabetbase` skill before `rabetbase menu`, `rabetbase bff`, `rabetbase page`, or dataset commands.
- Use the `codeup-push` skill before committing or pushing code.
- Never skip `rabetbase menu update --dry-run`; stop if warnings show resource deletion or unexpected menu targets.
- Do not update menus if build or upload fails.
- Keep `menu update` in `--mode patch` unless the user explicitly asks to replace all menu resources.
- BFF push and CDN/menu publish are separate. BFF status being clean does not prove CDN/menu are current.

## Release Flow

1. Inspect the repo state:

```bash
git status --short --branch
git diff --stat
git log -5 --oneline
```

2. Resolve release identity:

- Read `package.json` for `name` and `version`.
- Inspect `vite.config.ts` or build config to confirm the CDN output path and `CDN_DOMAIN` behavior.
- Confirm the Lovrabet app code from `.rabetbase.json` or `rabetbase app list`.

3. Bump version when the user asked to publish a new release:

```bash
npm version patch --no-git-tag-version
```

Use an explicit version only when the user supplied one.

4. Verify before publishing:

```bash
git diff --check
npm run build
```

If this project uses `CDN_DOMAIN` for versioned output, build with:

```bash
CDN_DOMAIN=https://g.lovrabet.com/ npm run build
```

Run targeted tests for changed areas. If full tests fail outside the release scope but targeted tests and build pass, report the failing suites as residual risk instead of hiding them.

5. Upload CDN assets:

```bash
yt upload dist
```

Derive expected resource URLs from package name and version:

```text
https://g.lovrabet.com/dist/<package-name>/<version>/assets/main.js
https://g.lovrabet.com/dist/<package-name>/<version>/assets/main.css
```

Verify both:

```bash
curl -I -L "<jsUrl>"
curl -I -L "<cssUrl>"
```

6. Sync missing menus, especially newly added pages:

```bash
rabetbase menu sync --appcode <appCode> --params '{"jsUrl":"<jsUrl>","cssUrl":"<cssUrl>"}' --format compress
```

Menu labels must be user-facing Chinese for business pages. After sync, inspect `rabetbase menu list`; if a new page has an English or route-derived label, stop and fix the menu/page title before finalizing.

7. Update existing menu resource URLs with dry-run first:

```bash
rabetbase menu update --appcode <appCode> --mode patch --params '{"jsUrl":"<jsUrl>","cssUrl":"<cssUrl>"}' --dry-run --format compress
```

Review target count, paths, before/after resources, and warnings. If correct, run the same command with `--yes`:

```bash
rabetbase menu update --appcode <appCode> --mode patch --yes --params '{"jsUrl":"<jsUrl>","cssUrl":"<cssUrl>"}' --format compress
```

8. Post-release verification:

```bash
rabetbase menu list --appcode <appCode> --format compress --jq '.data.menus[] | select(.resources | length > 0) | {label,path,resources}'
rabetbase bff status --appcode <appCode> --format compress
git status --short --branch
```

Confirm all procode menus that should use the release point at the new `main.js` and `main.css`.

9. Commit and push only when requested:

- Stage only related files.
- Use a Chinese commit message.
- Push with `git push -u origin HEAD`.
- Include commit hash and remote branch in the final response.

## Failure Handling

| Failure | Action |
|---|---|
| Build fails | Do not upload or update menus. Fix or report the build error. |
| `yt upload dist` fails | Do not update menus. Keep current menu resources. |
| CDN URL is not `200 OK` | Do not update menus until upload is confirmed. |
| Menu dry-run has warnings | Stop and explain the warning. |
| `menu sync` creates unexpected pages | Stop and inspect page labels/paths before `menu update`. |
| Full tests fail outside touched scope | Report exact failing suites and continue only if targeted tests plus build pass and user asked to publish. |

## Final Response

Report:

- version released
- CDN JS/CSS URLs
- menu sync/update counts
- verification commands and outcomes
- commit hash and push target if code was pushed
- residual risks, including any known unrelated test failures
