import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './NavBar.css';

const NavBar = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { path: '/executive-summary', label: 'Executive Summary' },
    { path: '/anomalies', label: 'Anomalies' },
    { path: '/root-cause', label: 'Root Cause Analysis' },
    { path: '/recommendations', label: 'Recommendations' },
    { path: '/maintenance', label: 'Planned Downtime' },
  ];

  return (
    <nav className="navbar">
      {navItems.map((item) => (
        <button
          key={item.path}
          className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
          onClick={() => navigate(item.path)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
};

export default NavBar;
