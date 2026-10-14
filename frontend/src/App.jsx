import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import DashboardPage from "./pages/DashboardPage";
import IngestPage from "./pages/IngestPage";
import QuarantinePage from "./pages/QuarantinePage";
import RecordDetailPage from "./pages/RecordDetailPage";
import AuditPage from "./pages/AuditPage";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/ingest" element={<IngestPage />} />
          <Route path="/quarantine" element={<QuarantinePage />} />
          <Route path="/quarantine/:id" element={<RecordDetailPage />} />
          <Route path="/audit/:rawObservationId" element={<AuditPage />} />
          <Route path="*" element={<div className="page"><p>Page not found.</p></div>} />
        </Routes>
      </main>
    </div>
  );
}
