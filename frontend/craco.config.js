/**
 * CRACO config — Tailwind CSS v4 + DaisyUI 5
 *
 * We use a direct webpack `configure` override instead of
 * CRACO's style.postcss abstraction.  This ensures EVERY
 * postcss-loader instance in CRA's webpack config is patched
 * (regular CSS, CSS Modules, SASS, …) so styles are never
 * silently dropped during HMR or production builds.
 *
 * autoprefixer is added AFTER @tailwindcss/postcss for full
 * cross-browser vendor-prefix support (Safari, Firefox, Edge).
 */
const tailwindPostcss = require('@tailwindcss/postcss');
const autoprefixer = require('autoprefixer');

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const patchPostCSSLoaders = (rules) => {
        if (!rules) return;
        for (const rule of rules) {
          // CRA wraps its real loaders inside a `oneOf` array
          if (rule.oneOf) patchPostCSSLoaders(rule.oneOf);

          // Walk the `use` array of each rule
          const loaders = Array.isArray(rule.use) ? rule.use : rule.use ? [rule.use] : [];
          for (const loader of loaders) {
            if (
              loader &&
              typeof loader === 'object' &&
              typeof loader.loader === 'string' &&
              loader.loader.includes('postcss-loader')
            ) {
              loader.options = {
                ...loader.options,
                postcssOptions: {
                  plugins: [tailwindPostcss, autoprefixer],
                },
              };
            }
          }
        }
      };

      patchPostCSSLoaders(webpackConfig.module.rules);
      return webpackConfig;
    },
  },
};
