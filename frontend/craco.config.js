module.exports = {
  style: {
    postcss: {
      mode: 'override',
      loaderOptions: (postcssLoaderOptions) => {
        postcssLoaderOptions.postcssOptions = {
          plugins: [require('@tailwindcss/postcss')],
        };
        return postcssLoaderOptions;
      },
    },
  },
};
