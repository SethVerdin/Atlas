// Web Speech API (Chrome, Edge, Safari). Firefox has none, so `supported` is false there.
import { useCallback, useEffect, useRef, useState } from 'react';

import type { Speech } from './use-speech';

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

function recognitionClass(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, unknown>;
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition) as (new () => Recognition) | undefined;
}

export function useSpeech(): Speech {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);

  const stop = useCallback(() => {
    recognition.current?.stop();
    recognition.current = null;
    setListening(false);
  }, []);

  const start = useCallback(
    (onText: (text: string) => void) => {
      const Ctor = recognitionClass();
      if (!Ctor) return;
      stop();
      const r = new Ctor();
      r.continuous = true;
      r.interimResults = true;
      r.lang = navigator.language || 'en-US';
      r.onresult = (e) => onText(Array.from(e.results, (res) => res[0].transcript).join(''));
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      recognition.current = r;
      r.start();
      setListening(true);
    },
    [stop],
  );

  useEffect(() => stop, [stop]);

  return { supported: recognitionClass() !== undefined, listening, start, stop };
}
