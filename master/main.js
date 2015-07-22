var xenios_mock_port = 12346;

var md5         = require('nyks/crypt/md5');
var Class       = require('uclass');


var MeetingServer  = new Class({
  Extends : require('./lib/server.js'),

  validate_device : function(pubkey, chain){

    pubkey = new Buffer(pubkey);
    var pem = utils.genPublicKey({public:pubkey, type:'rsa'}).publicOrig;
    var publicKey = pem.toString('ascii').replace(/\n/g, "").replace(/-----BEGIN PUBLIC KEY-----(.*)-----END PUBLIC KEY-----/ , "$1");

      //lookup based on public key signature is enough
    var device_key   = md5(util.format("%s:Server", publicKey)).toUpperCase();
    console.log("Incomming device key ", device_key);

    var xenios_url  = "http://127.0.0.1:"+xenios_mock_port;
    console.log("Validating with xenios ", xenios_url);
    http.get(xenios_url, function(res){
      console.log(res);
      chain(null, true);
    });

    return false;
  },

});


var server = new MeetingServer( {server_port:6000} );
server.start(function(){
  console.log("Server is started");
});


var Instance = require('../slave/lib/instance.js')
setTimeout(function(){
  var instance = new Instance({server_port:6000});
  instance.connect();
}, 1000);



/*****xenios mock ****/

var http = require('http');

var server = http.createServer(function(req, res){
  console.log(req.url);
  var body = "";
  req.on("data", function(buffer){
    body += buffer;
  });

  req.once("end", function(){
    console.log(body);

    body = JSON.stringify(["C54972D6017AFCE9997B0AFC04424CC7"]);

    res.end(body);

  });

});

server.listen(xenios_mock_port);

