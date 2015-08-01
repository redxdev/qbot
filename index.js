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

slack.on('message', function(msg) {
  if (typeof msg.text === 'undefined') return;
  if (slack.slackData.self.id === msg.user) return;

  var toSelf = '<@' + slack.slackData.self.id + '>';

  if (data.users[msg.user] === undefined) {
    data.users[msg.user] = '';
  }

  console.log('[Receive] ' + slack.getUser(msg.user).name + ': ' + msg.text);

  if (msg.text.indexOf(toSelf) === 0) {
    var scan = msg.text.substring(toSelf.length);
    var match = /^.*<@(?:.*)>.*$/g;
    var result = match.exec(scan);
    if (result) {
      var user = result[0];

      if(!data.users[msg.user]) {
        slack.sendMsg(msg.channel, "I don't have any data for that user!");
      }
      else {
        var m = markov(1);
        m.seed(data.users[msg.user], function () {
          var res = m.respond(m.pick()).join(' ');
          slack.sendMsg(msg.channel, '"' + res + '"');
        });
      }

    }
  }
  else {
    data.users[msg.user] += msg.text + '\n';
    jetpack.write('data.json', data, {atomic: true});
  }
});
