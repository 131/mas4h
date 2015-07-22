var ctl_port = 12345;
var xenios_mock_port = 12346;

var md5         = require('nyks/crypt/md5');
var Class       = require('uclass');
var http        = require('http');
var fs          = require('fs');
var util        = require('util');
var okeys       = require('mout/object/keys');
var choice      = require('mout/random/choice');
var utils       = require('ssh2').utils;


var MeetingServer  = new Class({
  Extends : require('./master/lib/server.js'),
  Binds : ['new_link', 'validate_device'],

  validate_device : function(pubkey, chain){
    console.log("Thisis pub", pubkey);

    pubkey = new Buffer(pubkey, 'base64');
    var pem = utils.genPublicKey({public:pubkey, type:'rsa'}).publicOrig;
    var publicKey = pem.toString('ascii').replace(/\n/g, "").replace(/-----BEGIN PUBLIC KEY-----(.*)-----END PUBLIC KEY-----/ , "$1");

      //lookup based on public key signature is enough
    var device_key   = md5(util.format("%s:Server", publicKey)).toUpperCase();
    console.log("Incomming device key ", device_key);

    var xenios_url  = "http://127.0.0.1:"+xenios_mock_port;
    console.log("Validating with xenios ", xenios_url);
    chain(null, device_key);
    
    return;
    var req = http.post(xenios_url, function(res){
      console.log(res)
    });
    req.write(JSON.stringify({
      device_key : device_key,
    }));
    req.end();
  },

  initialize : function(options){
    var self = this;
    MeetingServer.parent.initialize.call(this, options);
    var server = http.createServer(function(req, res){
      console.log(req.url);

      if(req.url == "/new") {

        self.new_link(function(err, lnk){
          if(err){
            res.statusCode = 400;
            return res.end(err);
          }
          res.end(JSON.stringify(lnk));
        });
      }  else if(req.url == "/link/list") {
          res.end(JSON.stringify(self.lnks) );
      } else {
        res.end("Invalid command");
      }
    });
    server.listen(ctl_port);
  },

    //pick a random target from slaves list
  new_link : function(chain){
    var self = this;
    var slave_id = choice(okeys(self.slaves)), slave = self.slaves[slave_id];
    if(!slave_id)
      return chain("No available slave");

    var lnk = {
      port : slave.remote_port,
      server_id : slave_id,
      host : slave.export_json().remoteAddress.address,
    };

    chain(null, lnk);
  },

});


var server = new MeetingServer( {server_port:6000} );
server.start(function(){
  console.log("Server is started");
});


var Instance = require('./slave/lib/instance.js')
setTimeout(function(){
  var instance = new Instance({server_port:6000, key : fs.readFileSync('instance.rsa')});
  instance.connect();
}, 1000);



/*****xenios mock ****/

var server = http.createServer(function(req, res){
  console.log('In xeznios req', req.url);
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

