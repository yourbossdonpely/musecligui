/** Copies text with the ordinary clipboard API. Every surface of the app runs top-level, so nothing can block it. */
export function copyText(text: string): Promise<void> {
  return navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error("No clipboard"));
}
