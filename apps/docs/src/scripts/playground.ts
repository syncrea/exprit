/**
 * `<exprit-playground>`: the full playground island. A CodeMirror 6 editor
 * highlighted by exprit's own tokenizer, a variable panel driven by
 * `variables(parse(...))`, a live result, and AST/token/printed views. All
 * parsing and evaluation goes through the real `@syncrea/exprit` package.
 */
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  EditorState,
  StateEffect,
  StateField,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  keymap,
  placeholder,
  type DecorationSet,
} from '@codemirror/view';
import {
  print,
  variables as variablesOf,
  type Dialect,
  type ParsedExpression,
} from '@syncrea/exprit';

import {
  BUDGET_MS,
  evaluateSafely,
  formatNanoseconds,
  formatTiming,
  isDialect,
  measureEvaluation,
  parseSource,
  viewOutcome,
  type ParseOutcome,
  type RunOutcome,
  type SyntaxProblem,
  type Timing,
} from '../lib/engine';
import { flattenAst, highlight, type TokenClass } from '../lib/inspect';
import {
  presetById,
  PRESETS,
  type Preset,
  type VariableType,
  type VariableValue,
} from '../lib/presets';
import {
  convertVariable,
  decodeShareState,
  DEFAULT_VARIABLE,
  definedNames,
  encodeShareState,
  parseVariable,
  VARIABLE_TYPE_LABELS,
  VARIABLE_TYPES,
  isVariableType,
} from '../lib/variables';

type Tab = 'ast' | 'tokens' | 'printed';

const isTab = (value: unknown): value is Tab =>
  value === 'ast' || value === 'tokens' || value === 'printed';

// ---------- editor extensions ----------

const setDialectEffect = StateEffect.define<Dialect>();
const setErrorEffect = StateEffect.define<number | null>();

const dialectField = (initial: Dialect): StateField<Dialect> =>
  StateField.define<Dialect>({
    create: () => initial,
    update: (value, transaction) =>
      transaction.effects.reduce(
        (current, effect) =>
          effect.is(setDialectEffect) ? effect.value : current,
        value,
      ),
  });

const tokenMark = (cls: TokenClass): Decoration =>
  Decoration.mark({ class: `tok-${cls}` });

const highlightExtension = (initial: Dialect): Extension => {
  const dialect = dialectField(initial);
  const build = (state: EditorState): DecorationSet => {
    const source = state.doc.toString();
    const ranges: Range<Decoration>[] = highlight(source, state.field(dialect))
      .spans.filter((span) => span.to > span.from && span.cls !== 'ident')
      .map((span) => tokenMark(span.cls).range(span.from, span.to));
    return Decoration.set(ranges, true);
  };
  const decorations = StateField.define<DecorationSet>({
    create: build,
    update: (value, transaction) =>
      transaction.docChanged ||
      transaction.effects.some((effect) => effect.is(setDialectEffect))
        ? build(transaction.state)
        : value,
    provide: (field) => EditorView.decorations.from(field),
  });
  return [dialect, decorations];
};

const errorMark = Decoration.mark({ class: 'cm-exprit-error' });

/** Underlines the character a syntax error points at. */
const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (value, transaction) => {
    let next = transaction.docChanged ? Decoration.none : value;
    for (const effect of transaction.effects) {
      if (effect.is(setErrorEffect)) {
        const length = transaction.state.doc.length;
        if (effect.value === null || length === 0) {
          next = Decoration.none;
        } else {
          const from = Math.min(effect.value, length - 1);
          next = Decoration.set([errorMark.range(from, from + 1)]);
        }
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--bg)',
    color: 'var(--text)',
    fontSize: '20px',
  },
  '&.cm-focused': {
    outline: '2px solid var(--focus)',
    outlineOffset: '-2px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
  },
  '.cm-content': {
    padding: '18px 0',
    caretColor: 'var(--text)',
  },
  '.cm-line': {
    padding: '0 18px',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--text)',
    borderLeftWidth: '2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    {
      backgroundColor: 'color-mix(in srgb, var(--accent) 28%, transparent)',
    },
  '.cm-placeholder': {
    color: 'var(--muted)',
  },
  '.cm-exprit-error': {
    textDecoration: 'underline wavy var(--err)',
    textDecorationSkipInk: 'none',
    textUnderlineOffset: '4px',
    backgroundColor: 'var(--err-bg)',
  },
});

// ---------- small DOM helpers ----------

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attributes: Readonly<Record<string, string>> = {},
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, value);
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
};

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item, index) => item === b[index]);

/** The source line with a caret under the error column. */
const errorSnippet = (source: string, problem: SyntaxProblem): string => {
  const line = source.split('\n')[problem.line - 1] ?? '';
  const caret = `${' '.repeat(Math.max(problem.column - 1, 0))}^`;
  return `${line}\n${caret} ${problem.reason}\n  at line ${problem.line}, column ${problem.column}`;
};

const countTokens = (source: string, dialect: Dialect): number =>
  highlight(source, dialect).chips.length;

// ---------- the element ----------

class ExpritPlayground extends HTMLElement {
  #dialect: Dialect = 'modern';
  #presetId = '';
  #source = '';
  /** Every value the visitor has set, kept even when a name leaves the expression. */
  readonly #values = new Map<string, VariableValue>();
  #names: readonly string[] = [];
  #tab: Tab = 'ast';
  #view: EditorView | undefined;
  #parsed: ParseOutcome | undefined;

  connectedCallback(): void {
    const shared = decodeShareState(window.location.hash);
    if (shared) {
      this.#dialect = shared.dialect;
      this.#source = shared.source;
      this.#presetId =
        this.#matchingPreset(shared.source, shared.dialect)?.id ?? '';
      Object.entries(shared.variables).forEach(([name, value]) =>
        this.#values.set(name, value),
      );
    } else {
      this.#loadPreset(PRESETS[0], false);
    }

    this.#mountEditor();
    this.#wireToolbar();
    this.#wireVariables();
    this.#wireTabs();
    this.#update();
  }

  // ----- state changes -----

  #matchingPreset(source: string, dialect: Dialect): Preset | undefined {
    return PRESETS.find((preset) => preset.sources[dialect] === source);
  }

  #loadPreset(preset: Preset, updateEditor = true): void {
    const source = preset.sources[this.#dialect];
    if (source === undefined) {
      const fallback =
        preset.sources.modern !== undefined ? 'modern' : 'legacy';
      this.#dialect = fallback;
    }
    this.#presetId = preset.id;
    this.#source = preset.sources[this.#dialect] ?? '';
    Object.entries(preset.variables).forEach(([name, value]) =>
      this.#values.set(name, value),
    );
    this.#names = [];
    if (updateEditor) {
      this.#syncEditor();
    }
  }

  #setDialect(dialect: Dialect): void {
    if (dialect === this.#dialect) {
      return;
    }
    const preset = presetById(this.#presetId);
    const swapped =
      preset &&
      preset.sources[this.#dialect] === this.#source &&
      preset.sources[dialect] !== undefined
        ? preset.sources[dialect]
        : undefined;
    this.#dialect = dialect;
    if (swapped !== undefined) {
      this.#source = swapped;
    }
    this.#syncEditor();
    this.#update();
  }

  /** Pushes source and dialect into the editor in one transaction. */
  #syncEditor(): void {
    const view = this.#view;
    if (!view) {
      return;
    }
    const current = view.state.doc.toString();
    view.dispatch({
      changes:
        current === this.#source
          ? undefined
          : { from: 0, to: view.state.doc.length, insert: this.#source },
      effects: setDialectEffect.of(this.#dialect),
    });
  }

  // ----- wiring -----

  #mountEditor(): void {
    const host = this.querySelector<HTMLElement>('[data-editor]');
    if (!host) {
      return;
    }
    host.replaceChildren();
    this.#view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: this.#source,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          placeholder('Type an expression, e.g. 2 + price * qty'),
          highlightExtension(this.#dialect),
          errorField,
          editorTheme,
          EditorView.contentAttributes.of({
            'aria-label': 'Expression',
            'aria-describedby': 'pg-result pg-result-meta',
            spellcheck: 'false',
            autocorrect: 'off',
            autocapitalize: 'off',
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              this.#source = update.state.doc.toString();
              this.#update();
            }
          }),
        ],
      }),
    });
  }

  #wireToolbar(): void {
    this.querySelectorAll<HTMLButtonElement>('[data-dialect]').forEach(
      (button) => {
        button.addEventListener('click', () => {
          const dialect = button.dataset['dialect'];
          if (isDialect(dialect)) {
            this.#setDialect(dialect);
          }
        });
      },
    );

    const select = this.querySelector<HTMLSelectElement>(
      '[data-example-select]',
    );
    select?.addEventListener('change', () => {
      const preset = presetById(select.value);
      if (preset) {
        this.#loadPreset(preset);
        this.#update();
      }
    });

    const copy = this.querySelector<HTMLButtonElement>('[data-copy-link]');
    copy?.addEventListener('click', () => {
      void this.#copyLink(copy);
    });
  }

  async #copyLink(button: HTMLButtonElement): Promise<void> {
    const shared = Object.fromEntries(
      this.#names.map((name) => [
        name,
        this.#values.get(name) ?? DEFAULT_VARIABLE,
      ]),
    );
    const hash = encodeShareState({
      dialect: this.#dialect,
      source: this.#source,
      variables: shared,
    });
    window.history.replaceState(null, '', `#${hash}`);
    const status = this.querySelector<HTMLElement>('[data-status]');
    try {
      await navigator.clipboard.writeText(window.location.href);
      button.dataset['copied'] = '';
      if (status) {
        status.textContent = 'Link copied to the clipboard';
      }
      setTimeout(() => delete button.dataset['copied'], 1500);
    } catch (error) {
      console.warn('Copying the link failed', error);
      if (status) {
        status.textContent =
          'The link is in the address bar; copying is not available here';
      }
    }
  }

  #wireVariables(): void {
    const container = this.querySelector<HTMLElement>('[data-variables]');
    if (!container) {
      return;
    }
    container.addEventListener('input', (event) => {
      const target = event.target;
      if (!(
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      )) {
        return;
      }
      const name = target.closest<HTMLElement>('[data-name]')?.dataset['name'];
      if (name === undefined) {
        return;
      }
      const current = this.#values.get(name) ?? DEFAULT_VARIABLE;
      const raw =
        target instanceof HTMLInputElement && target.type === 'checkbox'
          ? String(target.checked)
          : target.value;
      this.#values.set(name, { type: current.type, raw });
      if (target instanceof HTMLInputElement && target.type === 'checkbox') {
        const label = target.parentElement?.querySelector('[data-bool-text]');
        if (label) {
          label.textContent = raw;
        }
      }
      this.#evaluate();
    });
    container.addEventListener('change', (event) => {
      const target = event.target;
      if (!(target instanceof HTMLSelectElement)) {
        return;
      }
      const row = target.closest<HTMLElement>('[data-name]');
      const name = row?.dataset['name'];
      if (!row || name === undefined || !isVariableType(target.value)) {
        return;
      }
      const converted = convertVariable(
        this.#values.get(name) ?? DEFAULT_VARIABLE,
        target.value,
      );
      this.#values.set(name, converted);
      const index = Number(row.dataset['index'] ?? '0');
      row.replaceWith(this.#variableRow(name, index));
      this.querySelector<HTMLSelectElement>(`#pg-var-${index}-type`)?.focus();
      this.#evaluate();
    });
  }

  #wireTabs(): void {
    const tabs = [
      ...this.querySelectorAll<HTMLButtonElement>('[role="tab"][data-tab]'),
    ];
    const select = (tab: HTMLButtonElement, focus: boolean): void => {
      const id = tab.dataset['tab'];
      if (!isTab(id)) {
        return;
      }
      this.#tab = id;
      tabs.forEach((other) => {
        const isSelected = other === tab;
        other.setAttribute('aria-selected', String(isSelected));
        other.tabIndex = isSelected ? 0 : -1;
      });
      this.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
        panel.hidden = panel.dataset['panel'] !== id;
      });
      if (focus) {
        tab.focus();
      }
      this.#renderPanels();
    };
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => select(tab, false));
      tab.addEventListener('keydown', (event) => {
        const step =
          event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
        if (step !== 0) {
          event.preventDefault();
          select(tabs[(index + step + tabs.length) % tabs.length], true);
        }
      });
    });
  }

  // ----- rendering -----

  #update(): void {
    this.querySelectorAll<HTMLButtonElement>('[data-dialect]').forEach(
      (button) => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset['dialect'] === this.#dialect),
        );
      },
    );
    this.querySelectorAll('[data-dialect-label]').forEach((label) => {
      label.textContent = `${this.#dialect} dialect`;
    });

    const preset = presetById(this.#presetId);
    const isPresetSource =
      preset !== undefined && preset.sources[this.#dialect] === this.#source;
    const select = this.querySelector<HTMLSelectElement>(
      '[data-example-select]',
    );
    if (select) {
      select.value = isPresetSource ? this.#presetId : '';
    }
    const note = this.querySelector<HTMLElement>('[data-note]');
    if (note) {
      note.textContent = isPresetSource
        ? preset.note
        : 'Your own expression. Variables appear as you type them.';
    }

    this.#parsed = parseSource(this.#source, this.#dialect);
    const parsed = this.#parsed;

    const detail = this.querySelector<HTMLElement>('[data-error-detail]');
    const snippet = this.querySelector<HTMLElement>('[data-error-snippet]');
    if (parsed.kind === 'syntax') {
      this.#view?.dispatch({ effects: setErrorEffect.of(parsed.offset) });
      if (detail && snippet) {
        snippet.textContent = errorSnippet(this.#source, parsed);
        detail.hidden = false;
      }
    } else {
      this.#view?.dispatch({ effects: setErrorEffect.of(null) });
      if (detail) {
        detail.hidden = true;
      }
    }

    if (parsed.kind === 'parsed') {
      const defined = definedNames(parsed.expression.ast);
      const names = variablesOf(parsed.expression).filter(
        (name) => !defined.has(name),
      );
      if (!sameList(names, this.#names)) {
        this.#names = names;
        this.#renderVariables();
      }
    } else if (this.#names.length === 0) {
      this.#renderVariables();
    }

    this.#evaluate();
    this.#renderPanels();
  }

  #variableRow(name: string, index: number): HTMLElement {
    const value = this.#values.get(name) ?? DEFAULT_VARIABLE;
    if (!this.#values.has(name)) {
      this.#values.set(name, value);
    }
    const id = `pg-var-${index}`;
    const row = element('div', {
      class: 'pg-var',
      'data-name': name,
      'data-index': String(index),
    });

    const label = element(
      'label',
      { class: 'pg-var-name', for: `${id}-value` },
      name,
    );

    const type = element('select', {
      class: 'field pg-var-type',
      id: `${id}-type`,
      'aria-label': `Type of ${name}`,
    });
    VARIABLE_TYPES.forEach((option: VariableType) => {
      const node = element(
        'option',
        { value: option },
        VARIABLE_TYPE_LABELS[option],
      );
      node.selected = option === value.type;
      type.append(node);
    });

    const holder = element('div', { class: 'pg-var-value' });
    const describedBy = `${id}-error`;
    if (value.type === 'boolean') {
      const wrap = element('span', { class: 'pg-bool' });
      const box = element('input', {
        type: 'checkbox',
        id: `${id}-value`,
        'aria-describedby': describedBy,
      });
      box.checked = value.raw === 'true';
      wrap.append(
        box,
        element(
          'span',
          { 'data-bool-text': '' },
          value.raw === 'true' ? 'true' : 'false',
        ),
      );
      holder.append(wrap);
    } else if (value.type === 'json') {
      const area = element('textarea', {
        class: 'field',
        id: `${id}-value`,
        rows: String(Math.min(Math.max(value.raw.split('\n').length, 2), 8)),
        spellcheck: 'false',
        'aria-describedby': describedBy,
      });
      area.value = value.raw;
      holder.append(area);
    } else {
      const input = element('input', {
        class: 'field',
        id: `${id}-value`,
        type: 'text',
        spellcheck: 'false',
        autocomplete: 'off',
        'aria-describedby': describedBy,
      });
      if (value.type === 'number') {
        input.inputMode = 'decimal';
      }
      input.value = value.raw;
      holder.append(input);
    }

    const error = element('p', {
      class: 'pg-var-error',
      id: describedBy,
      'data-var-error': '',
    });
    row.append(label, type, holder, error);
    return row;
  }

  #renderVariables(): void {
    const container = this.querySelector<HTMLElement>('[data-variables]');
    if (!container) {
      return;
    }
    if (this.#names.length === 0) {
      container.replaceChildren(
        element(
          'p',
          { class: 'pg-empty' },
          this.#parsed?.kind === 'parsed'
            ? 'This expression reads no variables.'
            : 'Variables appear once the expression parses.',
        ),
      );
      return;
    }
    container.replaceChildren(
      ...this.#names.map((name, index) => this.#variableRow(name, index)),
    );
  }

  /** Reads the panel, evaluates, and shows the result. */
  #evaluate(): void {
    const parsed = this.#parsed;
    let outcome: RunOutcome;
    let timing: Timing | undefined;
    if (!parsed || parsed.kind !== 'parsed') {
      outcome = parsed ?? { kind: 'empty', message: 'Type an expression' };
    } else {
      const entries: [string, unknown][] = [];
      let problem: string | undefined;
      this.#names.forEach((name) => {
        const result = parseVariable(
          this.#values.get(name) ?? DEFAULT_VARIABLE,
        );
        const row = this.querySelector<HTMLElement>(
          `.pg-var[data-name="${CSS.escape(name)}"]`,
        );
        const control = row?.querySelector<HTMLElement>('.pg-var-value .field');
        const message = row?.querySelector<HTMLElement>('[data-var-error]');
        control?.setAttribute('aria-invalid', String(!result.ok));
        if (message) {
          message.textContent = result.ok ? '' : result.error;
        }
        if (result.ok) {
          entries.push([name, result.value]);
        } else {
          problem ??= `${name}: ${result.error}`;
        }
      });
      if (problem) {
        outcome = { kind: 'runtime', message: `Fix the value of ${problem}` };
      } else {
        const scope = Object.fromEntries(entries);
        const start = performance.now();
        outcome = evaluateSafely(parsed.expression, scope);
        const firstRunMs = performance.now() - start;
        if (outcome.kind === 'value') {
          // A slow expression is not run again: its one run is the measurement.
          timing =
            firstRunMs >= BUDGET_MS
              ? { nanosecondsPerRun: firstRunMs * 1e6, runs: 1 }
              : measureEvaluation(parsed.expression, scope);
        }
      }
    }
    this.#renderResult(outcome, parsed, timing);
  }

  #renderResult(
    outcome: RunOutcome,
    parsed: ParseOutcome | undefined,
    timing?: Timing,
  ): void {
    const view = viewOutcome(outcome);
    const result = this.querySelector<HTMLElement>('[data-result]');
    if (result) {
      result.textContent =
        outcome.kind === 'syntax'
          ? `${outcome.reason} (line ${outcome.line}, column ${outcome.column})`
          : view.text;
      result.classList.toggle('is-error', view.isError);
      result.classList.toggle('is-long', view.isLong);
    }
    const meta = this.querySelector<HTMLElement>('[data-meta]');
    if (meta) {
      const tokens = countTokens(this.#source, this.#dialect);
      if (parsed?.kind === 'parsed') {
        const nodes = flattenAst(parsed.expression.ast).length;
        const time = timing ? ` · ${formatTiming(timing)}` : '';
        meta.textContent = `${view.type} · ${tokens} tokens · ${nodes} nodes${time}`;
        meta.title = timing
          ? `evaluate() took ${formatNanoseconds(timing)} on average over ${timing.runs.toLocaleString('en')} runs in this browser`
          : '';
      } else if (parsed?.kind === 'syntax') {
        meta.textContent = `syntax error · ExpressionSyntaxError`;
      } else {
        meta.textContent = '';
      }
    }
  }

  #renderPanels(): void {
    const panel = this.querySelector<HTMLElement>(
      `[data-panel="${this.#tab}"]`,
    );
    const parsed = this.#parsed;
    if (!panel) {
      return;
    }
    if (this.#tab === 'tokens') {
      const { chips } = highlight(this.#source, this.#dialect);
      const list = element('ul', {
        class: 'chips',
        'aria-label': `${chips.length} tokens`,
      });
      chips.forEach((chip) =>
        list.append(element('li', { class: `tok-${chip.cls}` }, chip.text)),
      );
      panel.replaceChildren(
        element(
          'p',
          { class: 'panel-note' },
          "Tokens from exprit's tokenizer, the same ones the parser reads.",
        ),
        list,
      );
      return;
    }
    if (!parsed || parsed.kind !== 'parsed') {
      panel.replaceChildren(
        element(
          'p',
          { class: 'panel-note' },
          parsed?.kind === 'syntax'
            ? 'Nothing to show: the expression does not parse yet.'
            : 'Type an expression to inspect it.',
        ),
      );
      return;
    }
    if (this.#tab === 'printed') {
      panel.replaceChildren(
        element(
          'p',
          { class: 'panel-note' },
          this.#dialect === 'legacy'
            ? "print(expr): the legacy output matches expr-eval's toString() exactly."
            : 'print(expr): fully parenthesised, so you can see how exprit grouped it.',
        ),
        element('pre', {}, print(parsed.expression)),
      );
      return;
    }
    panel.replaceChildren(this.#astTree(parsed.expression));
  }

  #astTree(expression: ParsedExpression): HTMLElement {
    const tree = element('ol', { class: 'ast', 'aria-label': 'Syntax tree' });
    const kindClass: Readonly<Record<string, TokenClass>> = {
      Literal: 'num',
      Identifier: 'ident',
      Unary: 'op',
      Binary: 'op',
      Logical: 'kw',
      Conditional: 'kw',
      Call: 'fn',
      Member: 'fn',
      Index: 'fn',
      Arrow: 'kw',
      Template: 'str',
    };
    flattenAst(expression.ast).forEach((line) => {
      const row = element('li', {
        class: 'ast-line',
        style: `padding-left: ${line.depth * 22}px`,
      });
      if (line.label) {
        row.append(element('span', { class: 'ast-label' }, `${line.label} `));
      }
      row.append(
        element(
          'span',
          { class: `ast-kind tok-${kindClass[line.kind] ?? 'ident'}` },
          line.kind,
        ),
      );
      if (line.detail) {
        row.append(document.createTextNode(` ${line.detail}`));
      }
      tree.append(row);
    });
    return tree;
  }
}

if (!customElements.get('exprit-playground')) {
  customElements.define('exprit-playground', ExpritPlayground);
}
