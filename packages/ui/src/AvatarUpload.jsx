import { useEffect, useRef, useState } from "react";
import { uploadAvatar } from "@roleplayer/core/api/conversations.js";

const MAX_AVATAR_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read the selected file"));
    reader.readAsDataURL(file);
  });
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function AvatarUpload({ conversationId, avatarUrl, onUploaded }) {
  const fileInputRef = useRef(null);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);

  // A stale error (e.g. from a locked-chapter rejection) shouldn't linger
  // once the user has moved on to a different chapter/conversation — this
  // component stays mounted across the switch, only its props change.
  useEffect(() => {
    setError(null);
  }, [conversationId]);

  function openPicker() {
    if (uploading) return;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Image must be a PNG, JPEG, GIF, or WEBP");
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      setError("Image must be 3MB or smaller");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      await uploadAvatar(conversationId, dataUrl);
      onUploaded?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div id="avatar-upload">
      <div
        className="avatar-frame"
        onClick={openPicker}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && openPicker()}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="Character avatar" />
        ) : (
          <div className="avatar-placeholder">
            <UploadIcon />
            <span>{uploading ? "Uploading..." : "Upload Image"}</span>
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        hidden
        onChange={handleFileChange}
      />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
