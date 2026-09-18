import { useModalClose } from "@roleplayer/ui/useModalClose.js";

export default function MapModal({ onClose }) {
  const { overlayClass, requestClose } = useModalClose();
  return (
    <div className={overlayClass} onClick={() => requestClose(onClose)}>
      <div className="modal-panel map" onClick={(e) => e.stopPropagation()}>
        <img src="/cyberpunk-red-map.jpg" alt="Map" className="map-image" />
      </div>
    </div>
  );
}
