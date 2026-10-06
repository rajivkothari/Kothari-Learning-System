// Browser: reload the page.
export const CAN_RELOAD = true;
export function reloadApp(): void {
  globalThis.location?.reload();
}
