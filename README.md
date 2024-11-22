# Discord Economy Bot

A basic Discord bot implementing a simple economy system with daily rewards, jobs, trading, and balance checks.

## Features
- Daily rewards
- Job tasks for earning currency
- Trading between users with a small fee
- Balance checking

## Setup
1. Install dependencies: `npm install discord.js sqlite3`
2. Replace `'YOUR_BOT_TOKEN'` in the code with your actual Discord bot token
3. Run the bot using `node index.js`

## Usage
- Use `/daily` to receive a daily reward
- Use `/job` to complete a math task and earn currency
- Use `/trade @username <amount>` to trade currency with another user
- Use `/balance` to check your current balance

Note: This bot uses SQLite for persistent storage. Ensure proper setup and backups.
