declare global {
  interface Window {
    verovio: any
  }
}

// Adding this exports the declaration file which Typescript/CRA can now pickup:
export {}