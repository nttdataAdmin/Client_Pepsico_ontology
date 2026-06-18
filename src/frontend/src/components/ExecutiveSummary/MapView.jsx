import React from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './MapView.css';

// Fix for default marker icons in Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapView = ({ assets, selectedState, summary }) => {
  // Group assets by location
  const locationGroups = {};
  assets.forEach((asset) => {
    const key = `${asset.state}-${asset.plant}`;
    if (!locationGroups[key]) {
      locationGroups[key] = {
        state: asset.state,
        plant: asset.plant,
        location: asset.location,
        assets: [],
      };
    }
    locationGroups[key].assets.push(asset);
  });

  // Calculate status distribution for each location
  const locationData = Object.values(locationGroups).map((group) => {
    const statusCounts = {
      working: 0,
      failure_predicted: 0,
      under_maintenance: 0,
      breakdown: 0,
    };

    group.assets.forEach((asset) => {
      const status = asset.status.toLowerCase().replace(' ', '_');
      if (statusCounts.hasOwnProperty(status)) {
        statusCounts[status]++;
      }
    });

    return {
      ...group,
      statusCounts,
      total: group.assets.length,
    };
  });

  // Create custom icons based on status
  const createCustomIcon = (hasIssues) => {
    const color = hasIssues ? '#ffc107' : '#4caf50';
    return L.divIcon({
      className: 'custom-marker',
      html: `<div style="
        width: 20px;
        height: 20px;
        background-color: ${color};
        border: 3px solid white;
        border-radius: 50%;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      "></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10],
    });
  };

  // Calculate center of all locations for map view
  const calculateCenter = () => {
    if (locationData.length === 0) return [39.17, -89.62]; // Between Beloit WI & Jonesboro AR

    const avgLat = locationData.reduce((sum, loc) => sum + (loc.location?.lat || 39.17), 0) / locationData.length;
    const avgLon = locationData.reduce((sum, loc) => sum + (loc.location?.lon || -89.62), 0) / locationData.length;
    return [avgLat, avgLon];
  };

  return (
    <div className="map-view card">
      <div className="map-container">
        <MapContainer
          center={calculateCenter()}
          zoom={locationData.length <= 2 ? 5 : 4}
          style={{ height: '500px', width: '100%', borderRadius: '8px' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {locationData.map((location, index) => {
            if (!location.location) return null;

            const hasIssues = location.statusCounts.failure_predicted > 0 ||
              location.statusCounts.breakdown > 0 ||
              location.statusCounts.under_maintenance > 0;

            const customIcon = createCustomIcon(hasIssues);
            const plantName = location.plant.split(' - ')[1];

            return (
              <React.Fragment key={index}>
                {/* Main marker with status */}
                <Marker
                  position={[location.location.lat, location.location.lon]}
                  icon={customIcon}
                >
                  <Popup>
                    <div className="marker-popup">
                      <strong>{location.plant}</strong>
                      <div style={{ marginTop: '8px', fontSize: '12px' }}>
                        <div>Total Assets: {location.total}</div>
                        {location.statusCounts.working > 0 && (
                          <div style={{ color: '#4caf50' }}>Working: {location.statusCounts.working}</div>
                        )}
                        {location.statusCounts.failure_predicted > 0 && (
                          <div style={{ color: '#ffc107' }}>Failure Predicted: {location.statusCounts.failure_predicted}</div>
                        )}
                        {location.statusCounts.under_maintenance > 0 && (
                          <div style={{ color: '#ff9800' }}>Under Maintenance: {location.statusCounts.under_maintenance}</div>
                        )}
                        {location.statusCounts.breakdown > 0 && (
                          <div style={{ color: '#f44336' }}>Breakdown: {location.statusCounts.breakdown}</div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
                {/* Label marker positioned below the main marker */}
                <Marker
                  position={[location.location.lat - 0.15, location.location.lon]}
                  icon={L.divIcon({
                    className: 'marker-label-only',
                    html: `<div class="marker-label-text">${plantName}</div>`,
                    iconSize: [100, 20],
                    iconAnchor: [50, 10],
                  })}
                />
              </React.Fragment>
            );
          })}
        </MapContainer>
      </div>
      <div className="map-legend">
        <div className="legend-item">
          <div className="legend-color all-working"></div>
          <span>All Working</span>
        </div>
        <div className="legend-item">
          <div className="legend-color has-issues"></div>
          <span>Has Issues</span>
        </div>
      </div>
    </div>
  );
};

export default MapView;
