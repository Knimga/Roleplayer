import { useEffect, useRef, useState } from "react";

const MAX_ZOOM_MULTIPLIER = 4; // how far in a user can zoom beyond the fitted "contain" scale
const ZOOM_STEP = 1.15; // scale multiplier applied per wheel notch
const DRAG_THRESHOLD_PX = 3; // movement below this doesn't count as a drag, just click jitter

export default function MapModal({ onClose }) {
  const containerRef = useRef(null);
  const naturalSizeRef = useRef(null); // { width, height }, set once the image loads
  const viewRef = useRef(null); // mirrors `view` state, read inside event listeners so they never see a stale value
  const dragRef = useRef(null); // { startX, startY, startOffset } while a drag is in progress
  // True once a drag has moved past DRAG_THRESHOLD_PX, until the click that
  // follows mouseup consumes it. Releasing a drag outside .modal-panel makes
  // the browser target the click at .modal-overlay itself (the nearest
  // common ancestor of the mousedown and mouseup points) — modal-panel's own
  // stopPropagation never runs in that case, since it isn't in the click's
  // path. This flag lets the overlay's click handler tell "released after
  // dragging the map" apart from "actually clicked the backdrop."
  const draggedRef = useRef(false);

  const [view, setView] = useState(null); // { scale, offset: { x, y } } — null until the image has loaded
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Measured live rather than cached, since the viewport's own
  // max-width/max-height (90vw/85vh) can shrink it on a small window, and a
  // browser resize while the modal is already open would otherwise leave
  // any cached size (and the min-scale derived from it) stale.
  function getViewportSize() {
    const el = containerRef.current;
    return { width: el.clientWidth, height: el.clientHeight };
  }

  // "contain" scale: the smaller of the two axis-fit ratios, so the image
  // fits entirely within the viewport on its more-constraining axis without
  // ever exceeding the viewport on the other — the zoom-out floor.
  function getMinScale() {
    const { width: vw, height: vh } = getViewportSize();
    const { width, height } = naturalSizeRef.current;
    return Math.min(vw / width, vh / height);
  }

  // Per-axis: if the rendered image is smaller than the viewport on this
  // axis (only possible at/near the "contain" floor, and only on the
  // non-constraining axis), center it — empty space split evenly on both
  // sides, never all on one. Otherwise clamp so the image can't detach from
  // either edge.
  function clampAxis(pos, viewportSize, renderedSize) {
    if (renderedSize <= viewportSize) {
      return (viewportSize - renderedSize) / 2;
    }
    const min = viewportSize - renderedSize;
    return Math.min(0, Math.max(min, pos));
  }

  function clamp(x, y, scale) {
    const { width: vw, height: vh } = getViewportSize();
    const { width, height } = naturalSizeRef.current;
    return {
      x: clampAxis(x, vw, width * scale),
      y: clampAxis(y, vh, height * scale),
    };
  }

  function handleImageLoad(e) {
    const { naturalWidth, naturalHeight } = e.target;
    naturalSizeRef.current = { width: naturalWidth, height: naturalHeight };
    const fitScale = getMinScale();
    setView({ scale: fitScale, offset: clamp(0, 0, fitScale) });
  }

  // Attached manually (not React's onWheel) so preventDefault reliably stops
  // the page from scrolling behind the modal while the wheel zooms the map.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function handleWheel(e) {
      e.preventDefault();
      const current = viewRef.current;
      if (!current) return;

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const minScale = getMinScale();
      const maxScale = minScale * MAX_ZOOM_MULTIPLIER;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const newScale = Math.min(maxScale, Math.max(minScale, current.scale * factor));

      // Keep the map point under the cursor fixed in place as the scale changes.
      const imagePointX = (mouseX - current.offset.x) / current.scale;
      const imagePointY = (mouseY - current.offset.y) / current.scale;
      const newOffset = clamp(mouseX - imagePointX * newScale, mouseY - imagePointY * newScale, newScale);

      setView({ scale: newScale, offset: newOffset });
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  function handleMouseDown(e) {
    if (!view) return;
    e.preventDefault();
    draggedRef.current = false;
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOffset: view.offset };
    setDragging(true);
  }

  useEffect(() => {
    if (!dragging) return;

    function handleMouseMove(e) {
      const drag = dragRef.current;
      const current = viewRef.current;
      if (!drag || !current) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX) {
        draggedRef.current = true;
      }
      const newOffset = clamp(drag.startOffset.x + dx, drag.startOffset.y + dy, current.scale);
      setView({ scale: current.scale, offset: newOffset });
    }

    function handleMouseUp() {
      dragRef.current = null;
      setDragging(false);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging]);

  // A genuine backdrop click still closes the modal; a click synthesized
  // from releasing a map-drag outside modal-panel is swallowed instead — see
  // draggedRef's comment above for why the click even reaches here at all.
  function handleOverlayClick() {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-panel map" onClick={(e) => e.stopPropagation()}>
        <div
          ref={containerRef}
          className={`map-viewport${dragging ? " dragging" : ""}`}
          onMouseDown={handleMouseDown}
        >
          <img
            src="/Laria%20(4.0).jpg"
            alt="Map"
            className="map-image"
            draggable={false}
            onLoad={handleImageLoad}
            style={{
              visibility: view ? "visible" : "hidden",
              transform: view ? `translate(${view.offset.x}px, ${view.offset.y}px) scale(${view.scale})` : undefined,
            }}
          />
        </div>
      </div>
    </div>
  );
}
