var slackAPI = require('slackbotapi');
var jetpack = require('fs-jetpack');
var markov = require('markov');
var importer = require('./import');
var argv = require('yargs').argv;
var levelup = require('levelup');

var localUserId = null;

if (argv.import) {
  importer();
  return;
}

var config = jetpack.read('config.json', 'json');

var slack = new slackAPI({
  'token': config['api-key'],
  'logging': false
});

var db = levelup('./quotes.db', {valueEncoding: 'json'});
if (argv.importdb) {
  console.log("Importing old json database...");
  var data = jetpack.read('data.json', 'json') || {
    users: {}
  };

  var batch = db.batch();
  for (var key in data.users) {
    if (!data.users.hasOwnProperty(key)) continue;

    batch.put(key, data.users[key]);
  }

  batch.write(function () {
    console.log("Complete!");
    db.close();
    process.exit();
  });

  return;
}

console.log('Started qbot!');

slack.on('message', function(msg) {
  if (typeof msg.text === 'undefined') return;
  if (slack.slackData.self.id === msg.user) return;
  if (config['ignore'].indexOf(msg.user) >= 0) return;

  var toSelf = '<@' + slack.slackData.self.id + '>';

  var channel = slack.getChannel(msg.channel);
  var usr = slack.getUser(msg.user);
  console.log('[Receive] ' + (usr === null ? msg.user : usr.name) + ' in ' + (channel === null ? msg.channel : '#' + channel.name) + ': ' + msg.text);
  
  if (msg.text.indexOf(toSelf) === 0) {
    slack.sendTyping(msg.channel);
    
    var scan = msg.text.substring(toSelf.length);
    var match = /^.*<@(U........)>.*$/g;
    var result = match.exec(scan);
    if (result) {
      var user = result[1];
      console.log("[Lookup] User ID: " + user);
      if (config['ignore'].indexOf(user) >= 0) {
        slack.sendMsg(msg.channel, "That user is ignored, sorry!");
        return;
      }

      db.get(user, function (err, value) {
        var quotes = err.notFound ? [] : value;
        if (quotes.length === 0) {
          slack.sendMsg(msg.channel, "I don't have any data for that user :(");
        }
        else if (quotes.length < 2) {
          slack.sendMsg(msg.channel, "I don't have enough data for that user :(");
        }
        else {
          var m = markov(config.order);
          quotes.forEach(function (q) {m.seed(q);});

          var res = m.respond(scan).join(' ');
          res = '<@' + user + '> says, "' + res + '"';
          console.log('[Response] ' + res);
          slack.sendMsg(msg.channel, res);
        }
      });
    }
    else {
      var m = markov(config.order);
      db.createValueStream()
        .on('data', function (data) {
          m.seed(data);
        })
        .on('error', function (err) {
          slack.sendMsg(msg.channel, "Something went wrong!");
          console.log('[Error] ' + err);
        })
        .on('end', function () {
          var res = m.respond(scan).join(' ');
          console.log('[Response] ' + res);
          slack.sendMsg(msg.channel, res);
        });
    }
  }
  else {
    if (msg.text.length > 200) {
      console.log("Message too long - ignoring");
      return;
    }

    db.get(user, function (err, value) {
      var quotes = err.notFound ? [] : value;
      
      var text = msg.text.trim();
      var lowerText = text.toLowerCase();
      for (var i = 0; i < quotes.length; ++i) {
        if (lowerText === quotes[i].toLowerCase()) {
          console.log('Duplicate - ignoring');
          return;
        }
      }

      quotes.push(text);
      db.put(user, quotes);
    });
  }
});
