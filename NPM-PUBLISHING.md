# Publishing @knights-eye-chess/pgn-annotator

The owner authorized public npm prereleases on 10 October 2026. Use **`next`** and preserve any existing `latest` tag. Licensing is documented in [LICENSING.md](LICENSING.md).

The first registry prerelease was `0.1.0-dev.13`. The last prepared local
compatibility archive is `0.1.0-dev.17` with Move Classifier `0.1.0-dev.14`.
Check the registry before relying on the `next` tag. No dependency-only
successor is planned.

## Prepare the exact candidate

Use Node 24.19.0 and npm 11.9.0:

```sh
npm ci
npm run publish:prepare
```

Review `artifacts/knights-eye-chess-pgn-annotator-0.1.0-dev.17.tgz`, including its files, exports, declarations, licenses and exact registry dependencies. Reusable source and offline owner tests are intentional; application traces, credentials, vendor archives and source lockfiles are excluded. The checkout stays `private: true`; publish only the staged archive. Archive contents are immutable: use a new version for changed bytes.

Before every coordinated release, run `node tools/release-tooling/sync.mjs --check` in the reviewed app checkout against its current component registry. Record the app and component commits and the result.

## Publish through GitHub Actions

Manually dispatch **Publish reviewed npm candidate** on `dev` with the exact version and reviewed archive SHA-256. It requires a public component repository, runs clean installation and package checks, and refuses a different archive hash. `NPM_TOKEN` is supplied only to the publication step; GitHub OIDC supplies provenance. An already-published version is accepted only if its integrity matches.

Release Board UI, Game Tree and Move Classifier first; AI Analysis and PGN Annotator after Classifier; CLI Tools after its dependencies. Bootstrap source checkouts temporarily retain qualified local inputs until the sibling versions exist; staged consumer manifests already use exact npmjs versions. After registry integrity is verified, switch source manifests and locks to the registry and qualify clean installs.

Verify public imports, types and consumer examples after publication. No engine executable, provider credential, live AI answer or support guarantee is included. Automatic publication and future trusted-publisher configuration remain separate changes.

## Prepared retirement handoff — pending integration and release review

Claude's review of [application issue #64](https://github.com/knights-eye-chess/knightseye-net/issues/64)
recommends moving annotation to `composition-examples/annotation` and retaining
one final compatibility release that points users there. Existing published
versions, exports and the binary remain usable; historical archives are kept.
The package is not deprecated yet. Prepare the final release only after all of
these gates are recorded:

1. `composition-examples` is public at a reviewed immutable commit, uses exact
   published package versions, and its pinned-checkout CLI and programmatic
   annotation checks pass.
2. The application and engine service no longer depend on PGN Annotator or CLI
   Tools; the revised component graph and app checks pass.
3. Audit registry downloads and known external consumers. Preserve any needed
   compatibility API; use a new, unused version if the final README or archive
   differs from a committed archive.
4. Obtain the exact-commit release review required by the release workflow.

For that final version, retain working `knights-eye-annotate`, root annotation
API and `/engine` entry point, put the public examples URL and pinned-checkout
instructions in its packed README, then run the normal checked pack, archive
hash review and manual publication workflow above. Do not make a dependency-only
release just to follow engine changes. Once publication and the examples route
are verified, stage this npm deprecation message and command. Replace both
placeholders, inspect the resulting URL and version range, and complete the
exact-commit release review before running it:

```sh
EXAMPLES_COMMIT='<reviewed-public-commit-sha>'
DEPRECATION_MESSAGE="Knight's Eye PGN Annotator has moved to the executable annotation example at https://github.com/knights-eye-chess/composition-examples/tree/${EXAMPLES_COMMIT}/annotation. Run it from that pinned checkout; existing prereleases remain available for compatibility."
npm deprecate '@knights-eye-chess/pgn-annotator@<reviewed-range>' "$DEPRECATION_MESSAGE" --registry https://registry.npmjs.org/
```

Deprecation warns on installation; it does not unpublish any version. No publish
or deprecation command is part of this preparation.
