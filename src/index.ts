import { createBot, startBot } from './bot/bot.js';

async function main() {
  try {
    const bot = createBot();
    await startBot(bot);
  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

main();
