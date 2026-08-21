import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

export function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="navbar">
      <Link to="/" className="brand">
        Turnstile
      </Link>
      <nav>
        {user?.role === "organizer" && (
          <>
            <Link to="/events/new">New event</Link>
            <Link to="/scan">Scan</Link>
          </>
        )}
        {user?.role === "attendee" && <Link to="/mine">My tickets</Link>}
        {user ? (
          <button
            className="link-button"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Log out ({user.name})
          </button>
        ) : (
          <>
            <Link to="/login">Log in</Link>
            <Link to="/signup">Sign up</Link>
          </>
        )}
      </nav>
    </header>
  );
}
