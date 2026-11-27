Cariño — Listen Together, No Matter the Distance. ♡

<p align="center">
  <strong>A shared music experience for people who are miles apart.</strong>
</p>
<p align="center">
  <a href="https://listentocarino.vercel.app">Live Application</a> ·
  <a href="#features">Features</a> ·
  <a href="#tech-stack">Tech Stack</a> ·
  <a href="#getting-started">Getting Started</a>
</p>

⸻

About Cariño

Cariño is a real-time music listening platform designed to bring people closer through music, regardless of the distance between them.

Built around the idea that music is better when shared, Cariño allows authenticated users to create private listening rooms, invite someone using a room code, and experience synchronized music playback together.

Whether you’re separated by a few hundred or thousands of kilometers, Cariño makes listening together feel a little less distant.

The idea is simple: You don’t have to be in the same room to share the same song.

🌐 Live: https://listentocarino.vercel.app

Features

🎧 Shared Listening Experience

* Create private listening rooms.
* Invite others using unique room codes.
* Synchronize playback across room participants.
* Shared play, pause, next and previous controls.
* Real-time room state synchronization.

🎵 Music Library

* Centrally managed music catalog.
* Stream audio directly from Supabase Storage.
* Browse songs and playlists.
* Dynamically update the music catalog without redeploying the application.

🔐 Authentication & Access

* Google and Apple authentication.
* Authenticated user access.
* No anonymous or guest authentication.
* Dedicated administrative access for content management.

⚡ Real-Time Infrastructure

* Supabase Realtime for room communication.
* Playback state synchronization.
* Room membership and presence tracking.
* Lightweight synchronization events instead of transferring audio between users.

🎨 User Experience

* Premium, Apple Music-inspired visual direction.
* Minimal dark interface.
* Animated interactions and transitions.
* Immersive expanded music player.
* 3D carousel-based player experience.
* Progressive Web App (PWA) support.

🛠️ Admin Cockpit

A dedicated content management environment for authorized administrators.

* Upload and manage songs.
* Add and update cover artwork.
* Manage banners.
* Create and edit playlists.
* Delete existing catalog content.

Content is managed centrally, allowing updates to become available to users without requiring a new Vercel deployment.

Tech Stack

Technology	Purpose
Next.js	Application framework
React	UI development
TypeScript	Type safety
Tailwind CSS	Styling
Framer Motion	Animations and interactions
Zustand	Client-side state management
Supabase	Backend infrastructure
PostgreSQL	Relational database
Supabase Auth	User authentication
Supabase Storage	Music and media storage
Supabase Realtime	Room synchronization and presence
Vercel	Application deployment

Architecture Overview

Cariño follows a client-server architecture powered by Next.js and Supabase.

1. Authentication

Users authenticate through supported identity providers. Authenticated sessions determine access to the application and its protected functionality.

2. Music Delivery

Audio files are stored centrally in Supabase Storage. The browser’s native HTMLAudioElement handles audio playback.

Users stream the selected media rather than transferring audio files between listening-room participants.

3. Real-Time Synchronization

Supabase Realtime Broadcast and Presence facilitate communication between participants.

The application synchronizes playback information, including:

* Current track.
* Playback status.
* Playback position.
* Playback control events.
* Room membership and presence.

Each participant plays the centrally hosted audio independently while the room coordinates the listening experience.

4. Database

The application uses Supabase PostgreSQL for persistent application data.

Core data entities include:

* songs
* playlists
* playlist_tracks
* rooms
* room_members
* room_state

5. Content Management

Administrative functionality manages the shared music catalog and associated media through the backend.

This separates content management from the application’s deployment lifecycle.

Getting Started

Follow these steps to run Cariño locally.

Prerequisites

* Node.js
* npm, pnpm, yarn, or bun
* A Supabase project
* Git

1. Clone the repository

git clone <YOUR_REPOSITORY_URL>
cd carino

2. Install dependencies

npm install

3. Configure environment variables

Create a .env.local file in the project root.

Add the environment variables required by your Supabase and authentication configuration.

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

Additional environment variables may be required depending on the authentication providers and server-side integrations configured in your project.

Important: Never expose Supabase service-role keys or other privileged credentials through client-side environment variables.

Refer to your project’s environment configuration for the complete list of required variables.

4. Run the development server

npm run dev

Open http://localhost:3000 in your browser.

The application should now be running locally.

Deployment

Cariño is deployed using Vercel.

To deploy your own instance:

1. Push the project to a Git repository.
2. Import the repository into Vercel.
3. Configure the required environment variables.
4. Connect the appropriate Supabase project.
5. Deploy the application.

For additional information:

* Next.js Deployment Documentation
* Vercel Documentation
* Supabase Documentation

Project Vision

Cariño started with a simple thought: distance shouldn’t stop two people from sharing the little things that make them feel connected.

Music has always been one of those things.

Instead of building another music streaming interface, the goal was to explore how real-time technology, thoughtful interface design, and shared experiences could bring people closer together.

Cariño is an ongoing exploration of that idea.

Acknowledgements

Built with curiosity, experimentation, and a lot of iteration.

Powered by Next.js, Supabase, and the technologies that make real-time experiences possible.

⸻

<p align="center">
  <strong>Made with ♡ for the people who listen together, even when they're apart.</strong>
</p>
<p align="center">
  <a href="https://listentocarino.vercel.app">Experience Cariño</a>
</p>