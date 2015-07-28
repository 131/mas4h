var fs     = require('fs'),
    util   = require('util'),
    net    = require('net'),
    crypto = require('crypto');

var ssh2   = require('ssh2'),
    utils  = ssh2.utils,
    Class  = require('uclass');


var SshHost = new Class({

  initialize : function(server_rsa, validate_device, fetch_port, lost_device){
    var server = new ssh2.Server({ privateKey: server_rsa }, this.new_client.bind(this));
    this.validate_device = validate_device;
    this.fetch_port      = fetch_port;
    this.lost_device     = lost_device;

    this.listen = server.listen.bind(server);
  },

  new_client : function(client) {
    var self = this;
    console.log('Client connected!');

    client.on('end', function(){
      if(client.localNetServer)
        client.localNetServer.close()
    })

    client.once('request', this.forward_request.bind(this, client));
    client.on('authentication', this.check_authentication.bind(this, client));

    client.on('ready', function() {
      console.log('Client authenticated!');

      client.on('session', function(accept, reject) {
        var session = accept();

        console.log("Client come to check existing tunnel !");

        session.once('exec', function(accept, reject, info) {
          console.log('Client wants to execute: ' + info.command);
          var stream = accept();
          stream.stderr.write('Oh no, the dreaded errors!\n');
          stream.write('Just kidding about the errors!\n');
          stream.exit(0);
          stream.end();
        });
      });
    });

    client.on('error', function(){
        console.log("Client on error");
    });

    client.on('end', function() {
      self.lost_device(client);
    });
  },

  check_authentication : function(client, ctx) {

    if(!(ctx.method === 'publickey' && ctx.key.algo == "ssh-rsa"))
      return ctx.reject(['password', 'publickey'], true);

    var pem = utils.genPublicKey({public:ctx.key.data, type:'rsa'}).publicOrig;

    this.validate_device(ctx.key.data.toString('base64'), function(err, device_key) {
      client.device_key = device_key;
      console.log("FROM XENIOS VALIDATION IS ", err, device_key);

      if(!device_key)
        return ctx.reject(['password', 'publickey'], true);

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
      if(err)
        return reject();

      accept();

      server.listen(port, function() {
        console.log("Server bound at ", info.bindPort);
      });
    });
  },

});


module.exports = SshHost; 