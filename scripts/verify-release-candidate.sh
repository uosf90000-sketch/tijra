#!/usr/bin/env bash
set -euo pipefail

# Local dry run for a release-candidate tag. Does not create/push Git tags,
# perform database migrations, alter Railway or modify the production database.
TAG="v0.4.0-rc.1"
if [[ $# -gt 0 ]]; then TAG="$1"; fi
if [[ ! "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-rc\.[0-9]+$ ]]; then
  echo "ERROR: Release candidate tag must look like v0.4.0-rc.1" >&2
  exit 2
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Uncommitted changes are present. Review and commit first." >&2
  exit 1
fi
if ! git symbolic-ref -q HEAD >/dev/null; then
  echo "ERROR: Detached HEAD: switch to the intended release-candidate branch." >&2
  exit 1
fi
BRANCH="$(git branch --show-current)"
if [[ "$BRANCH" != "feat/purchase-guardian-20261023" ]]; then
  echo "ERROR: Expected feat/purchase-guardian-20261023, got $BRANCH" >&2
  exit 1
fi
if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
  echo "ERROR: Tag $TAG already exists locally. Don't move or overwrite it." >&2
  exit 1
fi
if [[ -z "$(printenv DATABASE_URL || true)" ]]; then
  echo "ERROR: Provide a non-production DATABASE_URL for Prisma validation and build." >&2
  echo "This script never connects to the database to write rows or schema." >&2
  exit 1
fi

echo "Checking $BRANCH at $(git rev-parse --short HEAD) for $TAG"
npm ci
npm audit --omit=dev --audit-level=critical
npx prisma validate
npm run db:generate
npm run audit:governance
node --test tests/*.test.mjs
npm run typecheck
npm run build

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ERROR: Validation changed tracked/untracked files. Review before tagging." >&2
  exit 1
fi
echo
echo "Local static and build checks passed. This does not verify staging DB migrations,"
echo "end-to-end authorization, privacy compliance or production performance."
echo "Complete those manual gates and confirm GitHub CI success before pushing any tag."
echo
echo "To create the annotated pre-release tag yourself:"
echo "  git tag -a $TAG $(git rev-parse HEAD) -m 'Tijra governance release candidate'"
echo "  git push origin $TAG"
