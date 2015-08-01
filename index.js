var slackAPI = require('slackbotapi');
var jetpack = require('fs-jetpack');
var markov = require('markov');

var localUserId = null;

var slack = new slackAPI({
  'token': jetpack.read('config.json', 'json')['api-key'],
  'logging': false
});

var data = jetpack.read('data.json', 'json') || {
  users: {}
};

console.log('Started qbot!');

slack.on('message', function(msg) {
  if (typeof msg.text === 'undefined') return;
  if (slack.slackData.self.id === msg.user) return;

  var toSelf = '<@' + slack.slackData.self.id + '>';

  console.log('[Receive] ' + slack.getUser(msg.user).name + ': ' + msg.text);

  if (msg.text.indexOf(toSelf) === 0) {
    var scan = msg.text.substring(toSelf.length);
    var match = /^.*<@(U........)>.*$/g;
    var result = match.exec(scan);
    if (result) {
      var user = result[1];
      console.log("[Lookup] User ID: " + user);
      if(data.users[user] === undefined)
        data.users[user] = [];

      if(data.users[user].length === 0) {
        slack.sendMsg(msg.channel, "I don't have any data for that user!");
      }
      else {
        var m = markov(1);
        for (var i = 0; i < data.users[user].length; ++i) {
          m.seed(data.users[user][i]);
        }

        user = slack.getUser(user);
        if (!user)
          user = '???'
        else
          user = user.name;

        var res = m.respond(m.pick()).join(' ');
        res = user + ' says, "' + res + '"';
        console.log('[Response] ' + res);
        slack.sendMsg(msg.channel, res);
      }
    }
  }
  else {
    if (data.users[msg.user] === undefined)
      data.users[msg.user] = [];

    data.users[msg.user].push(msg.text);
    jetpack.write('data.json', data, {atomic: true});
  }
});
