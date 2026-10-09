# @syncrea/exprit-cli

The `exprit` command: evaluate expressions from the terminal, pipe them
through stdin, or explore them in a REPL. Built on
[@syncrea/exprit](https://www.npmjs.com/package/@syncrea/exprit).

```sh
npm install --global @syncrea/exprit-cli
```

```sh
exprit "2 ^ 10"                                  # 1024
exprit -v x=3 "2 * x + 1"                        # 7
exprit -d modern -v 'xs=[1,2,3]' "xs.map(x => x * x)"   # [1,4,9]
echo "sqrt(16)" | exprit                         # 4
exprit                                           # interactive REPL
```

| Option                   | Meaning                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| `-d, --dialect <name>`   | `legacy` (expr-eval syntax, default) or `modern` (JavaScript syntax) |
| `-v, --var <name=value>` | Set a variable. The value is parsed as JSON, else kept as a string.  |
| `-j, --json`             | Print results as JSON                                                |
| `-h, --help`             | Show help                                                            |
| `--version`              | Show the version                                                     |

Reading from stdin evaluates one expression per line. In the legacy dialect,
assignments persist from line to line (`x = 2` then `x * 21`). The REPL adds
`.dialect [legacy|modern]`, `.vars`, `.help` and `.exit`.

Exit codes: `0` success, `1` an expression failed, `2` invalid arguments.

## License

MIT
