var unirest = require('unirest');

var commands = require('./commands');

function redditScrape(slack, db, msg, location, store, globalM) {
    console.log("Scraping reddit: " + location + " to " + store);
    unirest.get(location)
    .headers({'Accept': 'application/json'})
    .end(function (response) {
        var data = response.body;

        if (data.kind != "Listing") {
            slack.sendMsg(msg.channel, "reddit url must be a listing");
            return;
        }

        var posts = data.data.children;
        console.log("Found " + posts.length + " posts");

        db.get(store, function (err, value) {
            if (err) value = [];
            posts.forEach(function (p) {
                if (value.indexOf(p.data.title) >= 0)
                    return;

                value.push(p.data.title);
                globalM.seed(p.data.title);
            });

            db.put(store, value);
            console.log("Scraping complete");
            slack.sendMsg(msg.channel, "Scraping complete, found " + posts.length + " posts");
        });
    });
}

// !scrape <type> <location> <store>
function scrapeCommand(slack, db, msg, cmd, args, globalM) {
    if (args.length !== 3) {
        slack.sendMsg(msg.channel, "!scrape <type> <location> <store>");
        return;
    }

    var type = args[0];
    var location = args[1].replace('<', '').replace('>', '');
    var store = '+' + args[2];

    switch (type.toLowerCase()) {
    default:
        slack.sendMsg(msg.channel, "Scraper types: reddit");
        return;

    case 'reddit':
        redditScrape(slack, db, msg, location, store, globalM);
        break;
    }
}

commands.register('scrape', scrapeCommand);