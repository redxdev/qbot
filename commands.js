var commands = {};

function run(slack, db, msg, cmd, args) {
    if (commands[cmd] === undefined) {
        slack.sendMsg(msg.channel, "Unknown command !" + cmd);
        return;
    }

    commands[cmd](slack, db, msg, cmd, args);
}

function register(name, func) {
    commands[name] = func;
}

module.exports = {
    run: run,
    register: register
};