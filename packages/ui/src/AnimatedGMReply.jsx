import { useEffect, useMemo, useState } from "react";

const MS_PER_WORD = 18;

// Tokenizes **bold**/*italic* markup into word-level units so formatting
// still renders correctly even when a bold/italic span is only partially
// revealed mid-animation (a literal "**" briefly shows as plain text until
// the closing marker is revealed, then it snaps into <strong>/<em> — an
// acceptable, self-correcting quirk of animating markdown-ish text).
function tokenizeWords(text) {
  const segments = text.split(/(\*\*[^*]+?\*\*|\*[^*]+?\*)/g).filter(Boolean);
  const words = [];
  for (const segment of segments) {
    let type = "plain";
    let content = segment;
    if (segment.startsWith("**") && segment.endsWith("**")) {
      type = "bold";
      content = segment.slice(2, -2);
    } else if (segment.startsWith("*") && segment.endsWith("*")) {
      type = "italic";
      content = segment.slice(1, -1);
    }
    for (const part of content.split(/(\s+)/)) {
      if (part) words.push({ text: part, type });
    }
  }
  return words;
}

// Only used for a GM reply that just arrived live over SSE — reveals it
// word by word, each word fading in via CSS, instead of appearing all at
// once. Never used for history loaded from the DB; see ChatView.
export default function AnimatedGMReply({ text }) {
  const words = useMemo(() => tokenizeWords(text), [text]);
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    if (revealed >= words.length) return;
    const timer = setTimeout(() => setRevealed((n) => n + 1), MS_PER_WORD);
    return () => clearTimeout(timer);
  }, [revealed, words.length]);

  return words.slice(0, revealed).map((w, i) => {
    if (/^\s+$/.test(w.text)) return w.text;
    const rendered =
      w.type === "bold" ? <strong key={i}>{w.text}</strong> : w.type === "italic" ? <em key={i}>{w.text}</em> : w.text;
    return (
      <span key={i} className="fade-in-word">
        {rendered}
      </span>
    );
  });
}
