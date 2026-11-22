const STATES = Object.freeze(["idle", "happy", "sad", "celebrate"]);

/**
 * Changes the mascot pose and its accessible speech bubble.
 * @param {HTMLElement} mascot
 * @param {"bugsy" | "byte" | "cap"} name
 * @param {"idle" | "happy" | "sad" | "celebrate"} state
 * @param {string} message
 * @returns {void}
 */
export function updateMascot(mascot, name, state, message) {
  const image = mascot.querySelector("img");
  image.src = `/assets/${name}.svg`;
  image.alt = "";
  mascot.classList.remove(...STATES.map((pose) => `mascot-${pose}`));
  mascot.classList.add(`mascot-${STATES.includes(state) ? state : "idle"}`);
  mascot.querySelector(".speech").textContent = message;
}
