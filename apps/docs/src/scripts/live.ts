/**
 * `<exprit-live>`: progressive enhancement for the small inline demos. The
 * markup (and the first result) is rendered at build time; this element
 * re-evaluates with the real engine whenever an input changes.
 *
 * Markup contract, all inside the element:
 * - `[data-expr]`: the expression input or textarea
 * - `[data-var="name"][data-type="number|string|boolean|json"]`: variable inputs
 *   (a checkbox for booleans); `data-scope` on the element adds fixed values
 * - `[data-set-dialect="modern|legacy"]`: dialect buttons (`aria-pressed`)
 * - `[data-example]`: buttons that load their `data-example` source
 * - `[data-result]`, `[data-result-type]`, `[data-bool-label="name"]`: output
 */
import type { Dialect } from '@syncrea/exprit';

import { isDialect, run, viewOutcome, type RunOutcome } from '../lib/engine';
import type { VariableType } from '../lib/presets';
import { isVariableType, parseVariable } from '../lib/variables';

type ExpressionField = HTMLInputElement | HTMLTextAreaElement;

const readJson = (text: string | undefined): unknown => {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.warn('exprit-live: ignoring malformed data attribute', error);
    return undefined;
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

class ExpritLive extends HTMLElement {
  #dialect: Dialect = 'legacy';
  #sources: Readonly<Record<string, unknown>> = {};

  connectedCallback(): void {
    this.#dialect = isDialect(this.dataset['dialect'])
      ? this.dataset['dialect']
      : 'legacy';
    const sources = readJson(this.dataset['sources']);
    this.#sources = isRecord(sources) ? sources : {};

    this.addEventListener('input', () => this.#update());
    this.addEventListener('change', () => this.#update());
    this.addEventListener('click', (event) => this.#onClick(event));
    this.#update();
  }

  #field(): ExpressionField | null {
    return this.querySelector<ExpressionField>('[data-expr]');
  }

  #onClick(event: Event): void {
    if (!(event.target instanceof Element)) {
      return;
    }
    const example = event.target.closest<HTMLElement>('[data-example]');
    const field = this.#field();
    if (example && field) {
      field.value = example.dataset['example'] ?? '';
      field.focus();
      this.#update();
      return;
    }
    const toggle = event.target.closest<HTMLElement>('[data-set-dialect]');
    const next = toggle?.dataset['setDialect'];
    if (toggle && isDialect(next) && next !== this.#dialect) {
      // Swap the sample only if the visitor has not edited it.
      if (field && field.value === this.#sources[this.#dialect]) {
        const replacement = this.#sources[next];
        field.value =
          typeof replacement === 'string' ? replacement : field.value;
      }
      this.#dialect = next;
      this.#update();
    }
  }

  #variables(): {
    readonly values: Record<string, unknown>;
    readonly error?: string;
  } {
    const fixed = readJson(this.dataset['scope']);
    const entries: [string, unknown][] = isRecord(fixed)
      ? Object.entries(fixed)
      : [];
    let error: string | undefined;
    this.querySelectorAll<HTMLInputElement>('[data-var]').forEach((input) => {
      const name = input.dataset['var'] ?? '';
      const declared = input.dataset['type'];
      const type: VariableType = isVariableType(declared) ? declared : 'number';
      const parsed =
        input.type === 'checkbox'
          ? { ok: true as const, value: input.checked }
          : parseVariable({ type, raw: input.value });
      input.toggleAttribute('aria-invalid', !parsed.ok);
      if (parsed.ok) {
        entries.push([name, parsed.value]);
      } else {
        error ??= `${name}: ${parsed.error}`;
      }
      const label = this.querySelector(
        `[data-bool-label="${CSS.escape(name)}"]`,
      );
      if (label && input.type === 'checkbox') {
        label.textContent = String(input.checked);
      }
    });
    return { values: Object.fromEntries(entries), error };
  }

  #update(): void {
    this.querySelectorAll<HTMLElement>('[data-set-dialect]').forEach(
      (button) => {
        button.setAttribute(
          'aria-pressed',
          String(button.dataset['setDialect'] === this.#dialect),
        );
      },
    );
    this.querySelectorAll('[data-dialect-label]').forEach((label) => {
      label.textContent = `${this.#dialect} dialect`;
    });

    const field = this.#field();
    if (!field) {
      return;
    }
    const { values, error } = this.#variables();
    const outcome: RunOutcome = error
      ? { kind: 'runtime', message: error }
      : run(field.value, this.#dialect, values);
    this.#render(outcome);
  }

  #render(outcome: RunOutcome): void {
    const view = viewOutcome(outcome);
    const result = this.querySelector<HTMLElement>('[data-result]');
    if (result) {
      result.textContent = view.text;
      result.classList.toggle('is-error', view.isError);
      result.classList.toggle('is-long', view.isLong);
    }
    const type = this.querySelector<HTMLElement>('[data-result-type]');
    if (type) {
      type.textContent = view.type;
    }
  }
}

if (!customElements.get('exprit-live')) {
  customElements.define('exprit-live', ExpritLive);
}
