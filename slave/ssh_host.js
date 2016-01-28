var fs     = require('fs'),
    util   = require('util'),
    net    = require('net'),
    crypto = require('crypto');

var ssh2   = require('ssh2'),
    utils  = ssh2.utils,
    Class  = require('uclass');


var SshHost = new Class({

  initialize : function(server_rsa, new_device, validate_device, fetch_port, lost_device){
    var server = new ssh2.Server({ privateKey: server_rsa }, this.new_client.bind(this));
    this.new_device      = new_device || function() {};
    this.validate_device = validate_device;
    this.fetch_port      = fetch_port;
    this.lost_device     = lost_device;
    this.listen = server.listen.bind(server);
  },

  new_client : function(client) {
    var self = this;

    client.once('request', this.forward_request.bind(this, client));
    client.on('authentication', this.check_authentication.bind(this, client));

    client.on('error', function(err){
        console.log("Client on error", err);
    });

    client.once('end', function(){
      console.log("SSH lnk disconnected, local binding was %s", client.localPort);
      if(client.localNetServer)
        try {
          client.localNetServer.close();
        } catch(e) { } //throw an error if server is not listening
      if(client.device_key && client.localPort) {
        self.lost_device(client);
      }
    })

    this.new_device(client);
  },

  check_authentication : function(client, ctx) {
    client.username = ctx.username;

    if(!(ctx.method === 'publickey' && ctx.key.algo == "ssh-rsa"))
      return ctx.reject(['password', 'publickey'], true);

    var pem = utils.genPublicKey({public:ctx.key.data, type:'rsa'}).publicOrig;

    this.validate_device(ctx.key.data.toString('base64'), function(err, details) {
      if(err || !details.device_key)
        return ctx.reject(['password', 'publickey'], true);

      client.device_key = details.device_key;
      client.remote     = details;

      console.log("New client, validated device key is '%s'.", client.device_key, err );


      if (ctx.signature) {
        console.log("Verify signature");
        var verifier = crypto.createVerify(ctx.sigAlgo);
        verifier.update(ctx.blob);
        if (verifier.verify(pem, ctx.signature, 'binary'))
          ctx.accept();
        else
          ctx.reject(['password', 'publickey'], true);
      } else {
        // if no signature present, that means the client is just checking
        // the validity of the given public key
        ctx.accept();
      }
    });
  },

  forward_request : function(client, accept, reject, name, info){

    if(name != "tcpip-forward")
      return reject();

        //already listening
    if(client.localNetServer)
      return reject();

    var server = net.createServer(function(c){
      var out = client.forwardOut(
        info.bindAddr, info.bindPort,  //this is falsy, but we don't care
        c.remoteAddress, c.remotePort, function(err, channel){
          if(err) {
            //if the device is refusing lnks, maybe we should kill it ..
            console.log("Revert fowarding as been declined", err);
            return;
          }

          channel.pipe(c);
          c.pipe(channel);

          c.on("end", function(){
            console.log('Request is done');
          });
      });

      console.log("Request forward", out);
    });

    client.localNetServer = server;
    this.fetch_port(client, function(err, port) {
      console.log("Fetched remote port ", port);

      client.localPort = port;

      if(err)
        return reject();

      accept();

      server.listen(port, function() {
        console.log("Server forwarding lnk bound at %d ", port);
      });
      server.on('error', function(){
       client.end();
       //throw "Failed to listen to " + port;
      });

    });
  },

});


module.exports = SshHost; 
