import { useEffect, useRef, useState } from "react";

// How long the exit animation runs (see .modal-overlay.closing in each
// app's App.css) - the two must agree, since the callback that unmounts the
// modal fires on this timer, not on animationend.
export const MODAL_EXIT_MS = 140;

// The fade-out half of modal transitions. Fade-in is CSS alone (every
// .modal-overlay animates in on mount), but React unmounts a modal the
// instant its parent flips state, so the fade-out has to happen first:
// every close path calls requestClose(fn) instead of fn - the overlay gets
// the "closing" class, plays its exit animation, and only then does fn
// (onClose, onCancel, onCreated(id), ...) run and unmount it. A second
// requestClose during the exit is ignored.
export function useModalClose() {
  const [closing, setClosing] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function requestClose(fn) {
    if (closing) return;
    setClosing(true);
    timerRef.current = setTimeout(() => fn?.(), MODAL_EXIT_MS);
  }

  return { closing, overlayClass: `modal-overlay${closing ? " closing" : ""}`, requestClose };
}
