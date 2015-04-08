require('nyks');

var Server = require('./lib/server.js');


var server = new Server({port:6000});
server.start(function(){
  console.log("Server is started");
});

