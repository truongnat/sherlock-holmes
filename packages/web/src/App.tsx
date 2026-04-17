import { useState, useEffect, useRef } from "react";
import {
  Search,
  Shield,
  User,
  MapPin,
  Link as LinkIcon,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Github,
  Facebook,
  Instagram,
  Twitter,
} from "lucide-react";
import "./App.css";

interface Match {
  url?: string;
  displayName?: string;
  username?: string;
  avatar?: string;
  bio?: string;
  location?: string;
  confidence: number;
  evidence: string[];
}

interface ScanResult {
  providerId: string;
  matches: Match[];
  metadata: {
    durationMs: number;
  };
}

function App() {
  const [query, setQuery] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<ScanResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const startScan = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!query.trim() || isScanning) return;

    setIsScanning(true);
    setResults([]);
    setError(null);

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const url = `http://localhost:3001/api/scan?value=${encodeURIComponent(query)}&type=username`;
    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === "start") {
          console.log("Scan started...");
        } else if (data.event === "end") {
          setIsScanning(false);
          es.close();
        } else if (data.providerId) {
          // It's a ScanResult
          setResults((prev) => [...prev, data]);
        }
      } catch (err) {
        console.error("Failed to parse SSE message:", err);
      }
    };

    es.onerror = (err) => {
      console.error("SSE Error:", err);
      setError("Connection to server failed. Make sure the backend is running.");
      setIsScanning(false);
      es.close();
    };
  };

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const getProviderIcon = (id: string) => {
    switch (id.toLowerCase()) {
      case "github":
        return <Github size={20} />;
      case "facebook":
        return <Facebook size={20} />;
      case "instagram":
        return <Instagram size={20} />;
      case "twitter":
        return <Twitter size={20} />;
      default:
        return <LinkIcon size={20} />;
    }
  };

  return (
    <div className="holmes-container">
      <header className="holmes-header">
        <div className="logo">
          <Shield size={32} color="#3b82f6" />
          <h1>Sherlock Holmes</h1>
        </div>
        <p>Advanced OSINT Identity Tracking Engine</p>
      </header>

      <main className="holmes-main">
        <section className="search-section">
          <form onSubmit={startScan} className="search-box">
            <Search className="search-icon" size={20} />
            <input
              type="text"
              placeholder="Enter username to track..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <button type="submit" disabled={isScanning || !query.trim()}>
              {isScanning ? <Loader2 className="animate-spin" size={20} /> : "Scan Now"}
            </button>
          </form>
          {error && (
            <div className="error-msg">
              <AlertCircle size={16} /> {error}
            </div>
          )}
        </section>

        <section className="results-section">
          <div className="results-header">
            <h2>
              Results{" "}
              {results.length > 0 &&
                `(${results.reduce((acc, r) => acc + r.matches.length, 0)} matches)`}
            </h2>
            {isScanning && (
              <span className="scanning-status">
                <Loader2 size={14} className="animate-spin" /> Scanning platforms...
              </span>
            )}
          </div>

          <div className="results-grid">
            {results.map((result) =>
              result.matches.map((match, idx) => (
                <div key={`${result.providerId}-${idx}`} className="result-card">
                  <div className="card-header">
                    <div className="provider-tag">
                      {getProviderIcon(result.providerId)}
                      <span>{result.providerId.toUpperCase()}</span>
                    </div>
                    <div
                      className="confidence-tag"
                      style={{
                        backgroundColor:
                          match.confidence > 0.8
                            ? "#dcfce7"
                            : match.confidence > 0.5
                              ? "#fef9c3"
                              : "#fee2e2",
                        color:
                          match.confidence > 0.8
                            ? "#166534"
                            : match.confidence > 0.5
                              ? "#854d0e"
                              : "#991b1b",
                      }}
                    >
                      {(match.confidence * 100).toFixed(0)}% Match
                    </div>
                  </div>

                  <div className="card-body">
                    <div className="avatar-section">
                      {match.avatar ? (
                        <img src={match.avatar} alt="avatar" />
                      ) : (
                        <div className="avatar-placeholder">
                          <User size={24} />
                        </div>
                      )}
                    </div>
                    <div className="info-section">
                      <h3>{match.displayName || match.username || "Unknown User"}</h3>
                      <p className="handle">@{match.username}</p>
                      {match.bio && <p className="bio">{match.bio}</p>}
                      {match.location && (
                        <p className="location">
                          <MapPin size={12} /> {match.location}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="card-footer">
                    <div className="evidence">
                      {match.evidence.map((e) => (
                        <span key={e} className="evidence-pill">
                          {e}
                        </span>
                      ))}
                    </div>
                    {match.url && (
                      <a
                        href={match.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="visit-btn"
                      >
                        Visit Profile <LinkIcon size={14} />
                      </a>
                    )}
                  </div>
                </div>
              )),
            )}
            {!isScanning && results.length === 0 && !error && (
              <div className="empty-state">
                <Search size={48} opacity={0.2} />
                <p>Start a scan to discover social profiles</p>
              </div>
            )}
          </div>
        </section>
      </main>

      <footer className="holmes-footer">
        <p>&copy; 2026 Sherlock Holmes OSINT Engine. Built with Bun, Elysia & React.</p>
      </footer>
    </div>
  );
}

export default App;
