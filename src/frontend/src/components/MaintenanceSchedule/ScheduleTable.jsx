import React from 'react';
import './ScheduleTable.css';

const ScheduleTable = ({ schedule }) => {
  const getStatusColor = (status) => {
    switch (status) {
      case 'In Progress':
        return 'var(--color-under-maintenance)';
      case 'Scheduled':
        return 'var(--color-primary)';
      case 'Completed':
        return 'var(--color-working)';
      default:
        return '#ccc';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'Emergency':
        return 'var(--color-breakdown)';
      case 'Corrective':
        return 'var(--color-failure-predicted)';
      case 'Preventive':
        return 'var(--color-primary)';
      default:
        return '#ccc';
    }
  };

  return (
    <div className="schedule-table card">
      <table>
        <thead>
          <tr>
            <th>Year</th>
            <th>Month</th>
            <th>Day</th>
            <th>State</th>
            <th>Plant</th>
            <th>Asset ID</th>
            <th>Asset type</th>
            <th>Maintenance type</th>
            <th>Status</th>
            <th>Scheduled date</th>
            <th>Estimated duration (hours)</th>
          </tr>
        </thead>
        <tbody>
          {schedule.length === 0 ? (
            <tr>
              <td colSpan="11" style={{ textAlign: 'center', padding: '40px' }}>
                No maintenance scheduled
              </td>
            </tr>
          ) : (
            schedule.map((item, index) => (
              <tr key={index}>
                <td>{item.year}</td>
                <td>{item.month}</td>
                <td>{item.day}</td>
                <td>{item.state}</td>
                <td>{item.plant}</td>
                <td>{item.asset_id}</td>
                <td>{item.asset_type}</td>
                <td>
                  <span
                    className="type-badge"
                    style={{ backgroundColor: getTypeColor(item.maintenance_type) }}
                  >
                    {item.maintenance_type}
                  </span>
                </td>
                <td>
                  <span
                    className="status-badge"
                    style={{ backgroundColor: getStatusColor(item.status) }}
                  >
                    {item.status}
                  </span>
                </td>
                <td>{item.scheduled_date}</td>
                <td>{item.estimated_duration_hours}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default ScheduleTable;
