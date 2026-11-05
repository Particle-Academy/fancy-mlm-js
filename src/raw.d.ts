// Vite/Vitest `?raw` imports, used by tests to read the shared fixture as bytes.
declare module "*?raw" {
  const content: string;
  export default content;
}
