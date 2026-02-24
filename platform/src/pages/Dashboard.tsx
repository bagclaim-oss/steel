/**
 * Dashboard page showing customer's instances with status and controls.
 * TODO: Integrate with Better Auth for session management.
 * TODO: Fetch real instance data from /api/instances.
 */
export function Dashboard() {
  return (
    <div style={{ maxWidth: 800, margin: "0 auto", padding: 40, fontFamily: "system-ui" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Dashboard</h1>
        <a href="#/" style={{ color: "#666", textDecoration: "none" }}>
          Companion Cloud
        </a>
      </div>

      <div
        style={{
          border: "2px dashed #ddd",
          borderRadius: 12,
          padding: 40,
          textAlign: "center",
          marginTop: 20,
        }}
      >
        <p style={{ fontSize: 18, color: "#666" }}>No instances yet</p>
        <p style={{ color: "#999" }}>
          Create your first Companion instance to get started.
        </p>
        <button
          style={{
            marginTop: 16,
            padding: "10px 24px",
            background: "#000",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontSize: 14,
          }}
          onClick={() => {
            // TODO: Trigger Stripe checkout flow
            alert("Stripe checkout integration coming soon");
          }}
        >
          Create Instance
        </button>
      </div>
    </div>
  );
}
