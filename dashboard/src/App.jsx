import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";

const pages = [
  { path: "/", label: "Overview" },
  { path: "/knowledge", label: "Knowledge sources" },
  { path: "/embed", label: "Embed center" },
  { path: "/settings", label: "Assistant settings" },
];

function Page({ title }) {
  return <h1 style={{ color: "white" }}>{title}</h1>;
}

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ display: "flex", minHeight: "100vh", background: "#0b0d14" }}>
        <nav style={{ width: 220, padding: 16, background: "#12151f" }}>
          <h2 style={{ color: "white" }}>My Brand</h2>
          {pages.map((p) => (
            <NavLink
              key={p.path}
              to={p.path}
              style={({ isActive }) => ({
                display: "block",
                padding: "10px 12px",
                borderRadius: 8,
                color: isActive ? "white" : "#9aa0b4",
                background: isActive ? "#2a2f45" : "transparent",
                textDecoration: "none",
              })}
            >
              {p.label}
            </NavLink>
          ))}
        </nav>
        <main style={{ flex: 1, padding: 32 }}>
          <Routes>
            <Route path="/" element={<Page title="Overview" />} />
            <Route path="/knowledge" element={<Page title="Knowledge sources" />} />
            <Route path="/embed" element={<Page title="Embed center" />} />
            <Route path="/settings" element={<Page title="Assistant settings" />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}