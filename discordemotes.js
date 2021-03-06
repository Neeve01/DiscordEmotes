/*
    MIT License

    Copyright (c) 2018 Neeve / NotMyWing

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
*/

// Awful requires
const colors = require('colors');
const yargs = require('yargs');
const dateformat = require('dateformat');
const Discord = require('discord.js');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Awful console printing stuff
const INFO = (...args) => { console.log(dateformat(new Date(), "[HH:MM:ss]").green + " ".white + args) }
const ERROR = (...args) => { console.log(dateformat(new Date(), "[HH:MM:ss]").red + " " + args) }

// Awful constants
const COLOR_TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };
const IMAGE_EXTENSIONS = [
    '',
    '.jpeg',
    '.jpg',
    '.png',
    '.webp',
    '.tiff',
    '.gif',
    '.svg'
]

// Awful ARGV
var ARGV;

// Awful startBot declaration
function startBot(token) {
    // Create bot instance with autoreconnect feature turned on
    var bot = new Discord.Client({
        autoReconnect: true
    });

    // Display a fancy message when bot connects
    bot.on('ready', () => {
        INFO("Logged in as " + (bot.user.username + "#" + bot.user.discriminator).green + ".");
    });

    bot.on('message', async(msg) => {
        // Create message parsing regular expression
        var message_regex = /^\[(.+?)\]$/,
            partial_regex = /\[(.+?)\]\s*$/,
            match;

        // If message author is us..
        if (msg.author == bot.user) {

            // If it matches fully, then remove the whole message
            if (match = message_regex.exec(msg.content)) {
                // ...without awaiting the Promise
                if (msg.deletable)
                    msg.delete();
            }
            // Else match message tail
            else if (match = partial_regex.exec(msg.content)) {
                if (msg.editable) {
                    var new_content = msg.content.replace(partial_regex, "");
                    // Edit without awaiting the Promise
                    msg.edit(new_content);
                }
            }
            // If that fails too, then bail out silently
            else {
                return;
            }
            INFO("Got an emote message!");

            // Split message into separate emoticons by ',' symbol
            var emoticons = [],
                splitted = match[1].split(",");

            for (var i = 0; i < splitted.length; i++) {
                var emote = splitted[i].trim();

                // If emote is empty (,,), push 'null' into emoticons array
                if (emote === "") {
                    emoticons.push(null);
                }
                // Else push emote path
                else {
                    var directory = ARGV['imagePath'];
                    var options = {};

                    // Parse these awful prefixes!
                    while (true) {
                        if (emote.startsWith("!")) {
                            options.flip = true;
                            emote = emote.substr(1);
                        } else if (emote.startsWith("?")) {
                            options.single = true;
                            emote = emote.substr(1);
                        } else {
                            break;
                        }
                    }

                    // Add that fancy emote name without directories into options
                    options.name = path.basename(emote, path.extname(emote));

                    // Add trailing slash if it's missing
                    if (!directory.endsWith('/') && !directory.endsWith('\\'))
                        directory += "/";

                    var search_path = directory + emote;

                    // Search for picture using every supported extension
                    var success = IMAGE_EXTENSIONS.some((ext) => {
                        var path = search_path + ext;
                        if (fs.existsSync(path)) {
                            emoticons.push({
                                path: path,
                                options: options
                            })
                            return true;
                        }
                    });

                    // If not found, then notify
                    if (!success) {
                        ERROR("No picture found for " + emote.red + "!");

                        if (ARGV["notFoundSkip"] === "false") {
                            ERROR("Bailing out. (!notFoundSkip)");
                            return;
                        }
                    }
                }
            }

            // Handle single full-sized emotes if there's any
            if (emoticons.some((x) => x && x.options && x.options.single)) {
                // Create array of full-sized emotes and remove them from original array
                var singles = emoticons.filter((x) => x.options.single),
                    emoticons = emoticons.filter((x) => !x.options.single);

                var rescaleSize = ARGV["singleEmoteMaxSize"];
                // Chain promises, sending emotes in right order
                for (var i = 0; i < singles.length; i++) {
                    var emote = singles[i];

                    await new Promise(async(resolve) => {
                        // Load image from path
                        var buffer;

                        // Since gifs are unsupported by sharp, send them without rescaling
                        if (path.extname(emote.path).toLowerCase() == ".gif") {
                            buffer = fs.readFileSync(emote.path);
                        } else {
                            var img = sharp(emote.path);

                            // Rescale, if size is specified
                            if (rescaleSize)
                                img.resize(rescaleSize, rescaleSize).min();

                            // Send it and resolve the promise
                            buffer = await img.toBuffer();
                        }

                        msg.channel.send(new Discord.Attachment(buffer, path.basename(emote.path)))
                            .then((x) => {
                                INFO("Successfully sent " + emote.options.name + "!");
                                resolve();
                            })
                            .catch((x) => {
                                throw x;
                            });

                    }).catch((x) => {
                        ERROR("Couldn't send " + emote.options.name.red + ": " + x);
                    })
                }
            }

            // Bail silently if there's no emoticons at all
            if (emoticons.length == 0 || emoticons.every((x) => !x)) {
                return;
            }

            var promises = [];
            for (var i = 0; i < emoticons.length; i++) {
                promises.push(new Promise((resolve) => {
                    var img;
                    // If emoticon path is empty, then create an empty image instead of loading one from disk
                    if (!emoticons[i]) {
                        img = sharp({
                            create: {
                                width: ARGV['emoteSize'],
                                height: ARGV['emoteSize'],
                                channels: 4,
                                background: COLOR_TRANSPARENT
                            }
                        });
                    }

                    // Otherwise, load it from disk and resize to max
                    else {
                        img = sharp(emoticons[i].path)
                            .resize(ARGV['emoteSize'], ARGV['emoteSize'])
                            .background({ r: 0, g: 0, b: 0, alpha: 0 })
                            .embed();

                        if (emoticons[i].options.flip)
                            img.flop();
                    }

                    // Resolve promise with PNG data
                    img
                        .toFormat("png")
                        .toBuffer()
                        .then((buffer) => {
                            resolve(buffer);
                        });
                }));
            }

            Promise.all(promises).then((values) => {
                // Set up default options for every upcoming composition
                var options = {
                    width: values.length * ARGV['emoteSize'] + (values.length - 1) * ARGV['spacing'],
                    height: ARGV['emoteSize'],
                    channels: 4,
                    background: COLOR_TRANSPARENT
                };

                // Create transparent base
                var base = sharp({
                        create: options
                    })
                    .png()
                    .toBuffer();

                // Compose every emote picture
                var i = 0,
                    composite = values.reduce(function(input, overlay) {
                        return input.then(function(data) {
                            return sharp(data, options).overlayWith(overlay, {
                                    top: 0,
                                    left: ARGV['spacing'] * i + ARGV['emoteSize'] * (i++)
                                })
                                .png()
                                .toBuffer();
                        });
                    }, base);

                // Send composed images to channel
                composite.then((data) => {
                    sharp(data)
                        .png()
                        .toBuffer()
                        .then((buffer) => {
                            msg.channel.send(new Discord.Attachment(buffer, "image.png"))
                                .then((x) => {
                                    INFO("✦ Emotes sent with success! ✦");
                                })
                                .catch((x) => {
                                    ERROR("Couldn't send emotes. " + x);
                                });
                        });
                });
            });
        }
    });

    bot.login(token).catch((e) => {
        // Print fancy error message
        ERROR(e);
    });
}

// Print app header
console.log(` ===========================================================================

 DiscordEmotes.js - awful way of sending custom emotes without buying Nitro!
 Violating Discord ToS since day one.

 ===========================================================================

 Licensed under MIT license. Copyright NotMyWing, 2018.
`.green);


// Setup command line
const argv = yargs
    .command('start [token]', "- Start the bot", (yargs) => {
        yargs.positional('token', {
            describe: "Your Discord user token",
            default: null
        });
    }, (argv) => {
        // Set up ARGV reference
        ARGV = argv;

        INFO("Starting Discord Bot...");

        if (!argv.token) {
            ERROR("Empty Discord token passed.");
            return;
        }

        startBot(argv.token);
    })
    .option('emoteSize', {
        alias: ['emotesize', 'es'],
        describe: 'Emote box size. Proportional scaling',
        default: 32
    })
    .option('singleEmoteMaxSize', {
        alias: ['singleEmoteMaxSize', 'sems'],
        describe: 'Single emote box max size. Proportional scaling. Unrestricted by default.',
        default: null
    })
    .option('spacing', {
        alias: 's',
        describe: 'Spacing between emoticons, in pixels',
        default: 8
    })
    .option('notFoundSkip', {
        alias: ['notfoundskip', 'nfs'],
        describe: 'Skip image if it\'s not found in source directory. If false, message will not be sent',
        default: true
    })
    .option('imagePath', {
        alias: ['imagepath', 'ip'],
        describe: 'Path to source directory',
        default: "./images/"
    })
    .demandCommand(1, '')
    .argv;