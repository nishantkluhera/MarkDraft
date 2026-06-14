// Only used by Jest. Transforms dynamic import() to require() so the puppeteer
// mock in __mocks__ gets picked up. The app itself runs plain node, no babel.
module.exports = (api) => {
  const isTest = api.env('test');
  return {
    plugins: isTest
      ? [
        '@babel/plugin-transform-dynamic-import',
        '@babel/plugin-transform-modules-commonjs'
      ]
      : []
  };
};
