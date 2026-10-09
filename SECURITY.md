# Security policy

exprit evaluates expressions that often come from untrusted users, so its
sandbox is the core of what it promises. Reports of ways around it are very
welcome.

## Supported versions

Security fixes go into the latest release line. Please reproduce against the
latest version on npm before reporting.

| Package               | Supported         |
| --------------------- | ----------------- |
| `@syncrea/exprit`     | latest minor only |
| `@syncrea/exprit-cli` | latest minor only |

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub:

1. Go to [Report a vulnerability](https://github.com/syncrea/exprit/security/advisories/new)
   (the repository's **Security** tab → **Report a vulnerability**).
2. Include the exprit version, the dialect and API you used (`evaluate`,
   `compile`, `CompatParser`, ...), the expression, how the host set up its
   variables or environment, and what the expression reached or caused.

A minimal runnable proof of concept helps most.

## What to expect

- An acknowledgement within a few working days.
- A first assessment and, for a confirmed issue, a plan for the fix.
- A fix released as a patch version, followed by a GitHub security advisory
  that credits you unless you prefer otherwise. Please keep the issue
  private until the fix is released.

## Scope

In scope: anything an **expression** can do that the
[security model](https://exprit.syncrea.ch/#security) says it cannot, for
example:

- running code, reaching `Function`, `eval`, `globalThis`, `process` or a
  constructor;
- reading or changing a prototype, or polluting `Object.prototype`;
- mutating the data, environment or tables the host passed in;
- calling a host function with a `this` the expression chose;
- disclosing host source code or internals;
- crashing the process or bypassing a resource limit in a way the limits
  are meant to prevent.

Out of scope, because the documentation already names them as the host's
responsibility:

- exhausting memory with many values that each stay under the limits, or
  CPU time in general (run untrusted input in a worker or a separate process
  with a memory cap and a timeout);
- side effects of getters, or of methods relying on `this`, on objects the
  host chose to pass in;
- options the host deliberately weakened, such as limits set to `Infinity`.

The [security review](docs/security-review.md) lists the findings fixed so
far and the known open points.
