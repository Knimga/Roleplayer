export default function MapModal({ onClose }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel map" onClick={(e) => e.stopPropagation()}>
        <img src="/cyberpunk-red-map.jpg" alt="Map" className="map-image" />
      </div>
    </div>
  );
}
