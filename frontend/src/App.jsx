import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import DashboardPage from "./pages/DashboardPage";
import IngestPage from "./pages/IngestPage";
import ComparisonPage from "./pages/ComparisonPage";
import EvaluationPage from "./pages/EvaluationPage";
import QuarantinePage from "./pages/QuarantinePage";
import RecordDetailPage from "./pages/RecordDetailPage";
import RepairCenterPage from "./pages/RepairCenterPage";
import ModelManagementPage from "./pages/ModelManagementPage";
import AuditPage from "./pages/AuditPage";

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/ingest" element={<IngestPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="/quarantine" element={<QuarantinePage />} />
          <Route path="/quarantine/:id" element={<RecordDetailPage />} />
          <Route path="/repairs" element={<RepairCenterPage />} />
          <Route path="/repairs/:id" element={<RepairCenterPage />} />
          <Route path="/models" element={<ModelManagementPage />} />
          <Route path="/audit/:rawObservationId" element={<AuditPage />} />
          <Route path="*" element={<div className="page"><p>Page not found.</p></div>} />
        </Routes>
      </main>
    </div>
  );
}
