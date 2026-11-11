// @teckel/vue-pdf ships a .vue file and no declarations. It is used as a plain component and
// takes the pdf.js document source as `src`, so that is all this describes.
declare module '@teckel/vue-pdf' {
  import type { DefineComponent } from 'vue'
  const pdf: DefineComponent<Record<string, unknown>>
  export default pdf
}
