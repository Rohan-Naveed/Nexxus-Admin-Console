# Nexxus Admin Console

A React + Vite dashboard starter for the future admin console.

## Setup

1. Install dependencies
   ```bash
   npm install
   ```
2. Start the dev server
   ```bash
   npm run dev
   ```

## Architecture notes

- Data constants are stored in src/data/dispatchers.js.
- The service layer in src/services/dispatcherService.js is ready to be swapped with PostgreSQL or API calls later.
- USD conversion and formatting are centralized in src/utils/formatters.js.
- UI building blocks live in src/components/.
