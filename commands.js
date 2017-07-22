var commands = {};

function run(slack, db, msg, cmd, args, globalM) {
    if (commands[cmd] === undefined) {
        slack.sendMsg(msg.channel, "Unknown command !" + cmd);
        return;
    }

    commands[cmd](slack, db, msg, cmd, args, globalM);
}

function register(name, func) {
    commands[name] = func;
}

function resetCommand(slack, db, msg, cmd, args) {
    if (args.length != 1) {
        slack.sendMsg(msg.channel, "!reset <user>");
        return;
    }

    var match = /<U(.*)>$/g;
    match = match.exec(args[0]);
    var store = args[0];
    if (match) {
        store = match[1];
    }

    db.del(store, function (err) {
        if (err) {
            slack.sendMsg(msg.channel, "Unable to reset database for " + store);
        }
        else {
            slack.sendMsg(msg.channel, "Reset database for " + store);
        }
    });
}
register('reset', resetCommand);

module.exports = {
    run: run,
    register: register
};