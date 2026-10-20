import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import "./styles.css";
import { JobsPage } from "./pages/JobsPage.tsx";
import { JobPage } from "./pages/JobPage.tsx";
import { SettingsPage } from "./pages/SettingsPage.tsx";
import { PrintPage } from "./pages/PrintPage.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<JobsPage />} />
        <Route path="/jobs/:id" element={<JobPageRedirect />} />
        <Route path="/jobs/:id/:tab" element={<JobPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/print/:id/:doc" element={<PrintPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);

function JobPageRedirect() {
  const id = location.pathname.split("/")[2];
  return <Navigate to={`/jobs/${id}/invoice`} replace />;
}
