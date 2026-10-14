import { NavLink } from "react-router-dom";

export default function Navbar() {
  const linkClass = ({ isActive }) => "nav-link" + (isActive ? " nav-link-active" : "");

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <span className="brand-mark">R</span>
        <span>REFORGE</span>
      </div>
      <div className="navbar-links">
        <NavLink to="/" end className={linkClass}>Overview</NavLink>
        <NavLink to="/ingest" className={linkClass}>Inject Dataset</NavLink>
        <NavLink to="/comparison" className={linkClass}>Rule vs ML</NavLink>
        <NavLink to="/evaluation" className={linkClass}>Evaluation</NavLink>
        <NavLink to="/quarantine" className={linkClass}>Quarantine</NavLink>
        <NavLink to="/repairs" className={linkClass}>Repair Center</NavLink>
        <NavLink to="/models" className={linkClass}>Models</NavLink>
      </div>
    </nav>
  );
}
