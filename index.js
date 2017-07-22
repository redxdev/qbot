var slackAPI = require('slackbotapi');
var jetpack = require('fs-jetpack');
var markov = require('markov');
var importer = require('./import');
var argv = require('yargs').argv;
var levelup = require('levelup');
var commands = require('./commands');
require('./scraper');

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

var globalM = markov(config.order);
db.createValueStream()
  .on('data', function (data) {
    data.forEach(function (q) {globalM.seed(q);});
  })
  .on('error', function (err) {
    console.log('[Error] ' + err);
  }).on('end', function () {
    console.log('Global markov seed complete');
  });

console.log('Started qbot!');

function processResponse(res) {
  res.forEach(function (w, i) {
    var userMatch = /^.*<@(U........)>.*$/g;
    var commandMatch = /^.*<!(.*)(|.*)?>.*$/g;
    var result = userMatch.exec(w);
    if (result) {
      var usr = slack.getUser(result[1]);
      res[i] = usr ? ('@ ' + usr.name) : '@ (unknown user)';
    }
    else {
      result = commandMatch.exec(w);
      if (result) {
        res[i] = '@ ' + result[1];
      }
    }
  });

  return res;
}

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
    
    var scan = msg.text.substring(toSelf.length).trim();
    var match = /^<@(U........)>.*$/g;
    var storeMatch = /^\+(.*)$/g
    var cmdMatch = /^!(.*)$/g
    var result = match.exec(scan);
    var storeResult = storeMatch.exec(scan);
    var cmdResult = cmdMatch.exec(scan);
    if (result) {
      scan = scan.substring(result[1].length);
      var user = result[1];
      console.log("[Lookup] User ID: " + user);
      if (config['ignore'].indexOf(user) >= 0) {
        slack.sendMsg(msg.channel, "That user is ignored, sorry!");
        return;
      }

      db.get(user, function (err, value) {
        var quotes = err ? [] : value;
        if (quotes.length === 0) {
          slack.sendMsg(msg.channel, "I don't have any data for that user :(");
        }
        else if (quotes.length < 2) {
          slack.sendMsg(msg.channel, "I don't have enough data for that user :(");
        }
        else {
          var m = markov(config.order);
          quotes.forEach(function (q) {m.seed(q);});
          var res = m.respond(scan);

          var res = processResponse(m.respond(scan)).join(' ');
          res = '<@' + user + '> says, "' + res + '"';
          console.log('[Response] ' + res);
          slack.sendMsg(msg.channel, res);
        }
      });
    }
    else if(storeResult) {
      var store = '+' + storeResult[1].split(' ')[0];
      scan = scan.substring(store.length+1).trim();
      db.get(store, function (err, value) {
        var quotes = err ? [] : value;
        if (quotes.length === 0) {
          slack.sendMsg(msg.channel, "I don't have any data for " + store + " :(");
        }
        else if (quotes.length < 2) {
          slack.sendMsg(msg.channel, "I don't have enough data for " + store + " :(");
        }
        else {
          var m = markov(config.order);
          quotes.forEach(function (q) {m.seed(q);});
          var res = m.respond(scan);

          var res = processResponse(m.respond(scan)).join(' ');
          res = '"' + res + '"';
          console.log('[Response] ' + res);
          slack.sendMsg(msg.channel, res);
        }
      });
    }
    else if(cmdResult) {
      if (config.admins.indexOf(msg.user) < 0) {
        slack.sendMsg(msg.channel, "You don't have permission to do that!");
        return;
      }

      // command
      var cmdname = cmdResult[1].split(' ')[0];
      scan = scan.substring(cmdname.length+1).trim();
      var parts = scan.split(' ');

      console.log('Running ' + cmdname);
      console.log(parts);
      commands.run(slack, db, msg, cmdname, parts, globalM);
    }
    else {
      var res = processResponse(globalM.respond(scan)).join(' ');
      console.log('[Response] ' + res);
      slack.sendMsg(msg.channel, '"' + res + '"');
      var m = markov(config.order);
    }
  }
  else {
    if (msg.text.length > 240) {
      console.log("Message too long (" + msg.text.length + ") - ignoring");
      return;
    }

    if (!msg.user) {
      console.log("Undefined user received as part of message!");
      console.log(msg);
      return;
    }

    db.get(msg.user, function (err, value) {
      var quotes = err ? [] : value;
      
      var text = msg.text.trim();
      var lowerText = text.toLowerCase();
      for (var i = 0; i < quotes.length; ++i) {
        if (lowerText === quotes[i].toLowerCase()) {
          console.log('Duplicate - ignoring');
          return;
        }
      }

      quotes.push(text);
      db.put(msg.user, quotes);

      globalM.seed(text);
    });
  }
});
