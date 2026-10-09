/**
 * A Shiki theme whose colours are the site's CSS custom properties, so code
 * blocks follow the light/dark toggle without rendering twice.
 */
const scope = (scopes, foreground, fontStyle) => ({
  scope: scopes,
  settings: fontStyle ? { foreground, fontStyle } : { foreground },
});

export const sparkTheme = {
  name: 'exprit-spark',
  type: /** @type {const} */ ('dark'),
  fg: 'var(--text)',
  bg: 'var(--surface)',
  colors: {
    'editor.foreground': 'var(--text)',
    'editor.background': 'var(--surface)',
  },
  settings: [
    { settings: { foreground: 'var(--text)', background: 'var(--surface)' } },
    scope(['comment', 'punctuation.definition.comment'], 'var(--cm)'),
    scope(
      [
        'keyword',
        'storage',
        'storage.type',
        'storage.modifier',
        'keyword.control',
        'keyword.operator.new',
        'keyword.operator.expression',
        'keyword.operator.typeof',
        'variable.language',
      ],
      'var(--kw)',
    ),
    scope(
      [
        'string',
        'string.template',
        'punctuation.definition.string',
        'punctuation.definition.template-expression',
      ],
      'var(--str)',
    ),
    scope(
      ['constant.numeric', 'constant.language', 'constant.character'],
      'var(--num)',
    ),
    scope(
      [
        'entity.name.function',
        'support.function',
        'meta.function-call entity.name.function',
      ],
      'var(--fn)',
    ),
    scope(
      [
        'keyword.operator',
        'keyword.operator.arithmetic',
        'keyword.operator.logical',
        'keyword.operator.comparison',
        'keyword.operator.assignment',
        'storage.type.function.arrow',
      ],
      'var(--op)',
    ),
    scope(
      [
        'entity.name.type',
        'entity.name.class',
        'support.type',
        'support.class',
        'entity.other.inherited-class',
      ],
      'var(--type)',
    ),
    scope(['variable.parameter'], 'var(--text)'),
    scope(['markup.inserted', 'punctuation.definition.inserted'], 'var(--num)'),
    scope(['markup.deleted', 'punctuation.definition.deleted'], 'var(--err)'),
    scope(['entity.name.tag', 'support.variable.property'], 'var(--fn)'),
  ],
};
