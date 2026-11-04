// Player preferences that games read when they start (the rest of the settings live in App.svelte).
export const prefs = $state({
  /** Games that count a rest down take off a dart's score at once. Off: the rest changes after the visit. */
  instantCount: false,
});
