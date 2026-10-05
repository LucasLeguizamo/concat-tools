import { Shell } from "../lib/auth/ui";

export default function Home() {
  return (
    <Shell title="Google Gateway">
      <p className="dim">Gateway MCP + CLI hacia Google. Solo lectura.</p>
      <div className="actions">
        <a href="/dashboard" className="btn btn--primary">
          Ver mis modulos
        </a>
        <a href="https://onconcat.com" className="btn">
          onconcat.com
        </a>
      </div>
    </Shell>
  );
}
