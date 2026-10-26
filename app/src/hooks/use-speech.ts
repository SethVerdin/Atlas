// Speech-to-text for the composer's mic. Expo Go has no speech recognition module,
// so on iOS and Android the composer takes typed text instead (the keyboard's own
// dictation button still works). The web version is in use-speech.web.ts.

export type Speech = {
  supported: boolean;
  listening: boolean;
  /** Starts listening; onText gets the full transcript so far, again on every update. */
  start: (onText: (text: string) => void) => void;
  stop: () => void;
};

export function useSpeech(): Speech {
  return { supported: false, listening: false, start: () => {}, stop: () => {} };
}
