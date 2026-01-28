# iPod Classic Spotify Player

A web-based Spotify player that recreates the classic iPod interface, complete with a functional click wheel.

<img width="481" height="723" alt="iPod Classic Interface" src="https://github.com/user-attachments/assets/9d17ed91-d1b1-48ca-99a0-3dc0b1708daf" />

## Features

- Authentic iPod Classic UI
- Functional scroll wheel navigation (works with mouse/touch)
- Browse and play Spotify playlists
- Now Playing screen with album art and seek bar
- Playback controls (play/pause, next, previous)

## Prerequisites

- Node.js 18+
- A Spotify Premium account (required for Web Playback SDK)
- A Spotify Developer application

## Spotify Setup

1. Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Create a new application
3. In your app settings, add your redirect URI (e.g., `http://localhost:5173/` for development)
4. Copy your **Client ID**

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/ipod-classic.git
   cd ipod-classic
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Update the configuration in `src/components/SpotiPlayer.tsx`:
   ```typescript
   const CLIENT_ID = 'your-client-id-here';
   const REDIRECT_URI = 'http://localhost:5173/'; // or your production URL
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open the app and log in with your Spotify account

## Usage

- **Scroll Wheel**: Click and drag in a circular motion to navigate lists
- **Center Button**: Select highlighted item / return from Now Playing
- **Menu Button**: Go back to previous screen
- **Play/Pause**: Toggle playback
- **Forward/Back**: Skip to next/previous track

## Tech Stack

- React + TypeScript
- Vite
- Spotify Web Playback SDK
- Spotify Web API (via spotify-web-api-js)
