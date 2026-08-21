import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { NavBar } from "./components/NavBar";
import { LoginPage } from "./pages/LoginPage";
import { SignupPage } from "./pages/SignupPage";
import { EventsListPage } from "./pages/EventsListPage";
import { CreateEventPage } from "./pages/CreateEventPage";
import { MyRegistrationsPage } from "./pages/MyRegistrationsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { ScannerPage } from "./pages/ScannerPage";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <NavBar />
        <main>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <EventsListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/new"
              element={
                <ProtectedRoute roles={["organizer"]}>
                  <CreateEventPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mine"
              element={
                <ProtectedRoute roles={["attendee"]}>
                  <MyRegistrationsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/events/:id/dashboard"
              element={
                <ProtectedRoute roles={["organizer"]}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/scan"
              element={
                <ProtectedRoute roles={["organizer"]}>
                  <ScannerPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  );
}
