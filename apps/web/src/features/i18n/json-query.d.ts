// `./locales/en-US.json?faq` is served by the webpack loader in ./faq-split.js
// (the FAQ articles only). Type it loosely; faq.ts reduces whatever comes back
// to the shape it needs.
declare module "*.json?faq" {
  const value: unknown;
  export default value;
}
