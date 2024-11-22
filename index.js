const { Client, GatewayIntentBits, Partials } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// Initialize Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Channel],
});

// Initialize SQLite database
const db = new sqlite3.Database('./economy.db', (err) => {
    if (err) console.error('Database connection error:', err.message);
});

// Create users table if it doesn't exist
db.run(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    balance INTEGER DEFAULT 0,
    lastDaily TEXT
)`);

// When the client is ready
client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    registerCommands();
});

// Register slash commands
function registerCommands() {
    const data = [
        {
            name: 'daily',
            description: 'Claim your daily reward.',
        },
        {
            name: 'job',
            description: 'Complete a task to earn currency.',
        },
        {
            name: 'trade',
            description: 'Trade currency with another user.',
            options: [
                {
                    name: 'user',
                    type: 6, // USER type
                    description: 'User to trade with.',
                    required: true,
                },
                {
                    name: 'amount',
                    type: 4, // INTEGER type
                    description: 'Amount to trade.',
                    required: true,
                },
            ],
        },
        {
            name: 'balance',
            description: 'Check your current balance.',
        },
    ];

    client.application.commands.set(data)
        .then(() => console.log('Slash commands registered.'))
        .catch(console.error);
}

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    const { commandName, options, user } = interaction;

    try {
        if (commandName === 'daily') {
            await handleDaily(interaction, user);
        } else if (commandName === 'job') {
            await handleJob(interaction, user);
        } else if (commandName === 'trade') {
            await handleTrade(interaction, user, options);
        } else if (commandName === 'balance') {
            await handleBalance(interaction, user);
        }
    } catch (error) {
        console.error('Command handling error:', error);
        if (interaction.deferred || interaction.replied) {
            interaction.followUp({ content: 'An error occurred while executing the command.', ephemeral: true });
        } else {
            interaction.reply({ content: 'An error occurred while executing the command.', ephemeral: true });
        }
    }
});

// Handle daily reward
function handleDaily(interaction, user) {
    return new Promise((resolve, reject) => {
        const currentTime = new Date().toISOString();

        db.get(`SELECT balance, lastDaily FROM users WHERE id = ?`, [user.id], (err, row) => {
            if (err) {
                console.error('Database error:', err.message);
                return reject(err);
            }

            const now = new Date();
            let lastDaily = row && row.lastDaily ? new Date(row.lastDaily) : new Date(0);
            let diffTime = now - lastDaily;
            let diffHours = diffTime / (1000 * 60 * 60);

            if (diffHours >= 24) {
                let newBalance = (row ? row.balance : 0) + 100;

                db.run(
                    `INSERT INTO users (id, balance, lastDaily) VALUES (?, ?, ?) 
                     ON CONFLICT(id) DO UPDATE SET balance = ?, lastDaily = ?`,
                    [user.id, newBalance, currentTime, newBalance, currentTime],
                    (err) => {
                        if (err) {
                            console.error('Database update error:', err.message);
                            return reject(err);
                        }
                        interaction.reply(`You've received 100 coins! Your new balance is ${newBalance} coins.`);
                        resolve();
                    }
                );
            } else {
                const remaining = Math.ceil(24 - diffHours);
                interaction.reply(`You can claim your next daily reward in ${remaining} hour(s).`);
                resolve();
            }
        });
    });
}

// Handle job command with a task
async function handleJob(interaction, user) {
    // Generate a simple math question
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operation = Math.random() > 0.5 ? '+' : '-';
    const correctAnswer = operation === '+' ? num1 + num2 : num1 - num2;

    // Prompt the user with the task
    await interaction.reply({ content: `**Job Task:** Solve the following problem within 60 seconds:\nWhat is ${num1} ${operation} ${num2}?`, ephemeral: true });

    // Create a message collector
    const filter = response => response.author.id === user.id;

    const collector = interaction.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', (msg) => {
        const answer = parseInt(msg.content, 10);
        if (answer === correctAnswer) {
            const earnings = Math.floor(Math.random() * 50) + 50;

            db.get(`SELECT balance FROM users WHERE id = ?`, [user.id], (err, row) => {
                if (err) {
                    console.error('Database error:', err.message);
                    interaction.followUp({ content: 'An error occurred while updating your balance.', ephemeral: true });
                    return;
                }

                let newBalance = (row ? row.balance : 0) + earnings;

                db.run(
                    `INSERT INTO users (id, balance) VALUES (?, ?) 
                     ON CONFLICT(id) DO UPDATE SET balance = ?`,
                    [user.id, newBalance, newBalance],
                    (err) => {
                        if (err) {
                            console.error('Database update error:', err.message);
                            interaction.followUp({ content: 'An error occurred while updating your balance.', ephemeral: true });
                            return;
                        }
                        interaction.followUp({ content: `Correct! You earned ${earnings} coins. Your new balance is ${newBalance} coins.`, ephemeral: true });
                    }
                );
            });
        } else {
            interaction.followUp({ content: `Incorrect answer. The correct answer was ${correctAnswer}.`, ephemeral: true });
        }
    });

    collector.on('end', (collected) => {
        if (collected.size === 0) {
            interaction.followUp({ content: `Time's up! You did not answer the question in time.`, ephemeral: true });
        }
    });
}

// Handle trade command
function handleTrade(interaction, user, options) {
    return new Promise((resolve, reject) => {
        const recipient = options.getUser('user');
        const amount = options.getInteger('amount');

        if (recipient.id === user.id) {
            interaction.reply({ content: 'You cannot trade with yourself.', ephemeral: true });
            return resolve();
        }

        if (amount <= 0) {
            interaction.reply({ content: 'Amount must be greater than zero.', ephemeral: true });
            return resolve();
        }

        db.get(`SELECT balance FROM users WHERE id = ?`, [user.id], (err, senderRow) => {
            if (err) {
                console.error('Database error:', err.message);
                return reject(err);
            }
            if (!senderRow || senderRow.balance < amount) {
                interaction.reply({ content: 'Insufficient balance.', ephemeral: true });
                return resolve();
            }

            const fee = Math.ceil(amount * 0.05);
            const netAmount = amount - fee;
            const newSenderBalance = senderRow.balance - amount;

            db.run(`UPDATE users SET balance = ? WHERE id = ?`, [newSenderBalance, user.id], (err) => {
                if (err) {
                    console.error('Database update error:', err.message);
                    return reject(err);
                }

                db.get(`SELECT balance FROM users WHERE id = ?`, [recipient.id], (err, recipientRow) => {
                    if (err) {
                        console.error('Database error:', err.message);
                        return reject(err);
                    }

                    const newRecipientBalance = (recipientRow ? recipientRow.balance : 0) + netAmount;

                    db.run(
                        `INSERT INTO users (id, balance) VALUES (?, ?) 
                         ON CONFLICT(id) DO UPDATE SET balance = ?`,
                        [recipient.id, newRecipientBalance, newRecipientBalance],
                        (err) => {
                            if (err) {
                                console.error('Database update error:', err.message);
                                return reject(err);
                            }

                            interaction.reply(
                                `You sent ${netAmount} coins to ${recipient.username} after a fee of ${fee} coins. Your new balance is ${newSenderBalance} coins.`
                            );
                            resolve();
                        }
                    );
                });
            });
        });
    });
}

// Handle balance command
function handleBalance(interaction, user) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT balance FROM users WHERE id = ?`, [user.id], (err, row) => {
            if (err) {
                console.error('Database error:', err.message);
                interaction.reply({ content: 'An error occurred while retrieving your balance.', ephemeral: true });
                return reject(err);
            }

            const balance = row ? row.balance : 0;
            interaction.reply({ content: `Your current balance is ${balance} coins.`, ephemeral: true });
            resolve();
        });
    });
}

// Handle client errors
client.on('error', console.error);


// Login to Discord
client.login('YOUR_BOT_TOKEN');