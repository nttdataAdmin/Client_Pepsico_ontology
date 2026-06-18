import React, { useState } from 'react';
import { SITE_LOCATIONS } from '../../config/siteLocations';
import './FiltersPanel.css';

const PLANTS = ['P01 - Beloit', 'P01 - Jonesboro'];

const FiltersPanel = ({ filters, onFiltersChange }) => {
  const [searchState, setSearchState] = useState('');
  const [searchPlant, setSearchPlant] = useState('');
  const [searchAssetId, setSearchAssetId] = useState('');

  const states = SITE_LOCATIONS;

  const filteredStates = states.filter((state) =>
    state.toLowerCase().includes(searchState.toLowerCase())
  );
  const filteredPlants = PLANTS.filter((plant) =>
    plant.toLowerCase().includes(searchPlant.toLowerCase())
  );

  return (
    <div className="filters-panel card">
      <div className="filters-title">FILTERS</div>

      <div className="filter-section">
        <div className="filter-label">Location</div>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search"
            value={searchState}
            onChange={(e) => setSearchState(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="checkbox-list">
          {filteredStates.map((state) => (
            <label key={state} className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.state === state}
                onChange={(e) => {
                  onFiltersChange({
                    ...filters,
                    state: e.target.checked ? state : null,
                  });
                }}
              />
              <span>{state}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-label">Plant</div>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search"
            value={searchPlant}
            onChange={(e) => setSearchPlant(e.target.value)}
            className="search-input"
          />
        </div>
        <div className="checkbox-list">
          {filteredPlants.map((plant) => (
            <label key={plant} className="checkbox-item">
              <input
                type="checkbox"
                checked={filters.plant === plant}
                onChange={(e) => {
                  onFiltersChange({
                    ...filters,
                    plant: e.target.checked ? plant : null,
                  });
                }}
              />
              <span>{plant}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="filter-section">
        <div className="filter-label">Asset ID</div>
        <div className="search-box">
          <input
            type="text"
            placeholder="Search"
            value={searchAssetId}
            onChange={(e) => {
              setSearchAssetId(e.target.value);
              onFiltersChange({
                ...filters,
                asset_id: e.target.value || null,
              });
            }}
            className="search-input"
          />
        </div>
        {filters.asset_id && (
          <div className="asset-id-display">{filters.asset_id}</div>
        )}
      </div>
    </div>
  );
};

export default FiltersPanel;
