// Stands in for the browser parts jsdom does not have: the native popover and modal dialog, media queries and drag images.

HTMLElement.prototype.showPopover = function (this: HTMLElement) {
  this.setAttribute('data-shown', '')
}

HTMLElement.prototype.hidePopover = function (this: HTMLElement) {
  this.removeAttribute('data-shown')
  this.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }))
}

HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute('open', '')
}

HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute('open')
}

window.matchMedia ??= (query: string) =>
  ({ matches: false, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }) as MediaQueryList

window.scrollTo = () => {}
