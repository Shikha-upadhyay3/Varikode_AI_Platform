import { useState } from "react";

export default function AssistantSettings({ assistant, onSave }) {
  const [name, setName] = useState(assistant.name);
  const [logo, setLogo] = useState(assistant.logo);
  const [saved, setSaved] = useState(false);

  const handleLogo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      alert("Logo 1MB se chhota hona chahiye");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result); // base64
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    onSave({ name: name.trim() || "AI Assistant", logo });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <h2>Assistant settings</h2>

      <label style={{ display: "block", marginTop: 20 }}>AI ka naam</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        style={{
          width: "100%", padding: 10, marginTop: 6, borderRadius: 8,
          background: "#14141f", color: "#fff", border: "1px solid #2a2a3a",
        }}
      />

      <label style={{ display: "block", marginTop: 20 }}>Logo</label>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 6 }}>
        <div
          style={{
            width: 64, height: 64, borderRadius: "50%", background: "#2a2250",
            display: "grid", placeItems: "center", overflow: "hidden",
          }}
        >
          {logo ? (
            <img src={logo} alt="logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span>{name[0]}</span>
          )}
        </div>
        <input type="file" accept="image/*" onChange={handleLogo} />
        {logo && <button onClick={() => setLogo(null)}>Remove</button>}
      </div>

      <button
        onClick={handleSave}
        style={{
          marginTop: 28, padding: "10px 22px", borderRadius: 8, border: "none",
          background: "#6d4aff", color: "#fff", cursor: "pointer",
        }}
      >
        Save changes
      </button>
      {saved && <span style={{ marginLeft: 12, color: "#4ade80" }}>Saved ✓</span>}
    </div>
  );
}