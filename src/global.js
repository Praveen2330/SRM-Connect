// Provide a global polyfill with additional checks
const globalObject = typeof globalThis !== 'undefined' ? globalThis :
  typeof window !== 'undefined' ? window :
  typeof global !== 'undefined' ? global :
  typeof self !== 'undefined' ? self : {};

export default globalObject; 