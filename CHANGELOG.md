# 1.0.0 (2026-10-09)

### 📖 Documentation

- document the resource limits and modern-dialect hardening options ([f82d729](https://github.com/syncrea/exprit/commit/f82d729))
- add a security policy, contributing guide and issue templates ([c88eb19](https://github.com/syncrea/exprit/commit/c88eb19))
- correct the resource-limit comparison with expr-eval ([2b827c0](https://github.com/syncrea/exprit/commit/2b827c0))
- add a migration guide from expr-eval ([8c3b4c5](https://github.com/syncrea/exprit/commit/8c3b4c5))

### 🤖 CI

- release from GitHub Actions with approval and npm trusted publishing ([b96fc7f](https://github.com/syncrea/exprit/commit/b96fc7f))
- list documentation and CI changes in the changelog ([9a0fc98](https://github.com/syncrea/exprit/commit/9a0fc98))

### ❤️ Thank You

- Gion Kunz @chartist-js

## 0.7.2 (2026-10-09)

### 🩹 Fixes

- **cli:** report the installed version in --version ([1939cf5](https://github.com/syncrea/exprit/commit/1939cf5))

### ❤️ Thank You

- Gion Kunz @chartist-js

## 0.7.1 (2026-10-09)

### 🩹 Fixes

- **exprit:** repair the CommonJS type declarations and the core subpath for node10 ([5d1def0](https://github.com/syncrea/exprit/commit/5d1def0))

### ❤️ Thank You

- Gion Kunz @chartist-js

## 0.7.0 (2026-10-09)

### 🚀 Features

- mask host function source in string coercion and printers (F5) ([79990e7](https://github.com/syncrea/exprit/commit/79990e7))
- **cli:** escape terminal control sequences in tty output (F7) ([e29fa7c](https://github.com/syncrea/exprit/commit/e29fa7c))
- **core:** add resource limits against memory and CPU exhaustion (F1, F3) ([7d18e41](https://github.com/syncrea/exprit/commit/7d18e41))
- **core:** call methods read from evaluator-built objects with no receiver (F4) ([9b8debb](https://github.com/syncrea/exprit/commit/9b8debb))
- **docs:** add the exprit documentation site ([2b78029](https://github.com/syncrea/exprit/commit/2b78029))
- **docs:** show how long evaluate() takes in the playground ([1dfdd9f](https://github.com/syncrea/exprit/commit/1dfdd9f))
- **docs:** time every live example and keep the playground example in the URL ([f31e6aa](https://github.com/syncrea/exprit/commit/f31e6aa))
- **docs:** add a security checklist to the landing page ([0c88668](https://github.com/syncrea/exprit/commit/0c88668))
- **parser-modern:** honour allowMemberAccess and operators (F2) ([004a55a](https://github.com/syncrea/exprit/commit/004a55a))

### 🩹 Fixes

- close follow-ups from the post-fix sandbox review ([b16737e](https://github.com/syncrea/exprit/commit/b16737e))
- **core:** drop thisArg in the guarded flatMap reimplementation (F4) ([c5f9c84](https://github.com/syncrea/exprit/commit/c5f9c84))
- **core:** mark sandbox-built containers evaluator-owned for the receiver guard (F4) ([679ab9f](https://github.com/syncrea/exprit/commit/679ab9f))
- **docs:** highlight the section in view in the side navs ([e98e727](https://github.com/syncrea/exprit/commit/e98e727))
- **docs:** pre-bundle the playground dependencies in the dev server ([9cc0b38](https://github.com/syncrea/exprit/commit/9cc0b38))
- **docs:** generate the API docs after the libraries' declarations exist ([c37b1bd](https://github.com/syncrea/exprit/commit/c37b1bd))

### ❤️ Thank You

- Gion Kunz