import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:5173/#/cameras', pretendToBeVisual: true });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLButtonElement', 'HTMLDialogElement', 'HTMLVideoElement', 'Event', 'MouseEvent', 'HashChangeEvent', 'MutationObserver', 'getComputedStyle']) {
  Object.defineProperty(globalThis, key, { value: (dom.window as unknown as Record<string, unknown>)[key], configurable: true, writable: true });
}
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
dom.window.HTMLMediaElement.prototype.load = () => {};
globalThis.URL.createObjectURL = () => 'blob:raise-test-local-preview';
globalThis.URL.revokeObjectURL = () => {};

export { dom };
