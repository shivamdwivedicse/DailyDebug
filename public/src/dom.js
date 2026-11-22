/**
 * Returns a required element, failing clearly when the markup is incomplete.
 * @param {string} selector
 * @returns {HTMLElement}
 */
export function getElement(selector) {
  const element = findElement(selector);
  if (!element) throw new Error(`Required element was not found: ${selector}`);
  return element;
}

/**
 * Returns a matching element when present.
 * @param {string} selector
 * @returns {HTMLElement | null}
 */
export function findElement(selector) {
  return document.querySelector(selector);
}

/**
 * Sets an element's text without parsing markup.
 * @param {string} selector
 * @param {string} text
 * @returns {void}
 */
export function setText(selector, text) {
  getElement(selector).textContent = text;
}

/**
 * Sets a form or progress element's value.
 * @param {string} selector
 * @param {string | number} value
 * @returns {void}
 */
export function setValue(selector, value) {
  getElement(selector).value = String(value);
}
