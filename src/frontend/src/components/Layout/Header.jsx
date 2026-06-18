import React from 'react';
import { Link } from 'react-router-dom';
import './Header.css';

const Header = ({ selectedMonth, selectedYear, onMonthChange, onYearChange, filters, onFiltersChange, user, onLogout }) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const years = [2022, 2023, 2024];
  const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  const getQuarter = (month) => {
    const monthIndex = months.indexOf(month);
    return quarters[Math.floor(monthIndex / 3)];
  };

  return (
    <header className="header">
      <div className="header-content">
        <div className="header-top">
          <div className="logo-container">
            <img
              src={`${process.env.PUBLIC_URL}/logo.png`}
              alt="PepsiCo Logo"
              className="logo-image"
            />
          </div>
          <h1 className="header-title">PEPSICO MANAGEMENT SYSTEM</h1>
          <div className="header-center">
            <span className="system-description">AI-Powered Agentic Maintenance Management System</span>
          </div>
          <div className="header-right">
            <div className="header-links">
              <Link to="/upload" className="production-link" title="Upload QC form">
                Upload form
              </Link>
            </div>
            {user && (
              <div className="user-section">
                <span className="user-name" title={user.email || ''}>
                  Welcome, {user.username}
                  {user.email ? <span className="user-email"> · {user.email}</span> : null}
                </span>
                <button onClick={onLogout} className="logout-button">Logout</button>
              </div>
            )}
          </div>
        </div>
        <div className="timeline">
          <div className="timeline-years">
            {years.map((year) => (
              <div key={year} className="year-group">
                <span className="year-label">{year}</span>
                <div className="quarter-group">
                  {quarters.map((quarter) => (
                    <span key={quarter} className="quarter-label">{quarter}</span>
                  ))}
                </div>
                <div className="months-group">
                  {months.map((month) => (
                    <button
                      key={month}
                      className={`month-button ${selectedMonth === month && selectedYear === year ? 'active' : ''}`}
                      onClick={() => {
                        onMonthChange(month);
                        onYearChange(year);
                      }}
                    >
                      {month}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
