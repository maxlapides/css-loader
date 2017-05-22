/* eslint-disable */
import { getOptions } from 'loader-utils';
import validateOptions from 'schema-utils';

import postcss from 'postcss';

// TODO replace with postcss-icss-{url, import}
// when updated
import urls from './lib/plugins/url';
import imports from './lib/plugins/import';

import SyntaxError from './lib/Error';

// Default Options
const defaults = {
  url: true,
  import: true,
  sourceMap: false,
};

export default function loader(src, map, meta) {
  const options = Object.assign({}, defaults, getOptions(this));

  validateOptions(require('./options.json'), options, 'CSS Loader');
  // Make the loader async
  const cb = this.async();
  const file = this.resourcePath;

  // HACK Add module type (module.type name to be discussed)
  if (this._module) this._module.type = 'text/css';

  if (options.sourceMap) {
    if (map && typeof map !== 'string') {
      map = JSON.stringify(map);
    }
  } else {
    map = false;
  }

  const plugins = [];

  // TODO add option to filter urls
  if (options.url) plugins.push(urls());
  if (options.import) plugins.push(imports());

  // Avoid reparsing the CSS
  // TODO pass AST in postcss-loader
  if (meta && meta.ast) src = meta.ast;

  postcss(plugins).process(src, {
    // TODO we need a prefix to avoid path rewriting of PostCSS
    from: /* `/css-loader!${file}` */ file,
    to: file,
    map: options.sourceMap && {
      prev: map || false,
      inline: false,
      annotation: false,
      sourcesContent: true,
    },
  }).then((result) => {
    return {
      css: result.css,
      map: result.map && result.map.toJSON(),
      messages: result.messages,
    };
  })
    .then(({ css, map, messages }) => {
      if (messages) {
        const { urls, imports } = messages;

        // url('./file.png')
        // => import CSS__URL__${idx} from './file.png';
        messages.urls = Object.keys(urls)
          .map((url, idx) => `import ${url} from '${urls[url]}';`)
          .join('\n');

        // @import './file.css'
        // => import CSS__IMPORT__${idx} from './file.css';
        messages.imports = Object.keys(imports)
          .map((i, idx) => `import ${i} from '${imports[i]}';`)
          .join('\n');

        // TODO maybe handle CSS Module Messages here e.g
        // messages.selectors = Object.keys(selectors)
        //   .map(($) => `export const ${$} = '${messages.selectors[$]}'`)
        //   .join('\n')
      }

      const imports = `${messages.imports}\n${messages.urls}`;
      const exports = '// CSS Modules Exports'; /* `${messages.selectors}`*/

      // TODO triage and add CSS runtime back
      const result = [
        `// CSS Imports\n${imports}\n`,
        `// CSS Exports\n${exports}\n`,
        `// CSS Content\nexport default \`${css}\``,
      ].join('\n');

      cb(null, result, map);

      return null;
    })
    .catch((err) => {
      err.name === 'CssSyntaxError' ? cb(new SyntaxError(err)) : cb(err);
    });
}
