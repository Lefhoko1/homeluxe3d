import React from 'react';

const Header = ({ isAdmin, onLogout }) => {
  return (
    <div id="header">
      <div>
        <h1>🏡 HomeLuxe 3D</h1>
        <div className="header-subtitle">Virtual Furniture Showroom</div>
      </div>
      <div id="admin-controls" style={{ display: isAdmin ? 'block' : 'none' }}>
        <button id="logout-btn" className="control-btn" onClick={onLogout}>Logout</button>
      </div>
    </div>
  );
};

export default Header;
