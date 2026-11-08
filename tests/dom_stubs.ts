// Stands in for the browser parts jsdom does not have beyond X-Libs' popover and dialog stubs: media queries and scrolling.
import '@x-tech-laboratories/x-libs/web/react/test_stubs'

window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList

window.scrollTo = () => {}
