var jetpack = require('fs-jetpack');

module.exports = function () {
  var data = jetpack.read('data.json', 'json') || {
    users: {}
  };

  var count = 0;

  var importDirs = jetpack.list('import', true);
  for (var i = 0; i < importDirs.length; ++i) {
    var dir = importDirs[i];
    if (dir.type !== 'dir')
      continue;

    var files = jetpack.list('import/' + dir.name);
    for (var j = 0; j < files.length; ++j) {
      var filename = files[j];
      var ext = filename.split('.').pop();
      if (ext !== 'json')
        continue;

      var importData = jetpack.read('import/' + dir.name + '/' + filename, 'json');
      if (!importData) {
        console.warn("Can't import import/" + dir.name + '/' + filename);
        continue;
      }

      console.log("Importing import/" + dir.name + '/' + filename);
      for (var k = 0; k < importData.length; ++k) {
        var msg = importData[k];
        if (msg.type !== 'message' || msg.subtype !== undefined)
          continue;

        var user = msg.user;
        if (!data.users[user])
          data.users[user] = [];

        data.users[user].push(msg.text);
        ++count;
      }
    }
  }

  console.log("Import complete, writing to disk...");
  jetpack.write('data.json', data, {atomic: true});
  console.log("Imported " + count + " messages.");
}
