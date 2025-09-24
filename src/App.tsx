import {MemoryRouter as Router, Routes, Route} from 'react-router-dom';
import './App.css';
import React, {useRef, useState, useEffect} from 'react';
import {useNavigate} from 'react-router-dom';
import SpotiPlayer from './components/SpotiPlayer.js';

export default function App() {
  return (
    <Router>
      <div>
        <Routes>
          <Route path="/" element={<SpotiPlayer/>}/>
          <Route path="/spotiplayer" element={<SpotiPlayer/>}/>
        </Routes>
      </div>
    </Router>
  );
}
