# Merchant API Pusher (CLI)

## Quick start
```bash
git clone <your repo url>
cd merchant-api-pusher
cp .env.example .env   # fill values
npm ci
npm run create-datasource
npm run push
npm run status -- <OFFER_ID>
