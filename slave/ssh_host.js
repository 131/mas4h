'use strict';

const fs     = require('fs');
const util   = require('util');
const net    = require('net');
const crypto = require('crypto');

const ssh2   = require('ssh2');
const utils  = ssh2.utils;
const debug       = require('debug')('mas4h:slave');


class SshHost {

  constructor(server_rsa, new_device, validate_device, fetch_port, lost_device){
    var server = new ssh2.Server({hostKeys: [server_rsa]}, this.new_client.bind(this));
    this.new_device      = new_device || function() {};
    this.validate_device = validate_device;
    this.fetch_port      = fetch_port;
    this.lost_device     = lost_device;
    this.listen = server.listen.bind(server);
  }

  new_client(client) {
    client.on('authentication', this.check_authentication.bind(this, client));
    client.once('request', this.forward_request.bind(this, client));

    client.on('error', function(err){
      debug("Client on error", err);
    });

    client.once('end', async () => {
      debug("Client %s disconnected, local binding was %s", client.details.client_key, client.details.localPort);
      try {
        if(client.localNetServer)  
          client.localNetServer.close();
        if(client.details && client.details.client_key && client.details.localPort) {
          await this.lost_device(client);
        }
      } catch(e) { }
    })
    this.new_device(client);
  }

  async check_authentication(client, ctx) {
    client.username = ctx.username;
    if(!(ctx.method === 'publickey' && ctx.key.algo == "ssh-rsa"))
      return ctx.reject(['password', 'publickey'], true);
    var pem = utils.genPublicKey({public:ctx.key.data, type:'rsa'}).publicOrig;
    try{
      var details = await this.validate_device(ctx.key.data.toString('base64'));
      if(!details.client_key)
        throw 'no client_key';
      client.details          = Object.assign({}, details) || {};
      debug("New client, validated device key is '%s'.", client.details.client_key);
      if (ctx.signature) {
        debug("Verify signature");
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
    }catch(err){
      debug(err)
      return ctx.reject(['password', 'publickey'], true);
    }
  }

  async forward_request(client, accept, reject, name, info){
    
    if(name != "tcpip-forward")
      return reject();
        //already listening
    if(client.localNetServer)
      return reject(); 

    var server = net.createServer(function(c){
      try {
        var out = client.forwardOut(
          info.bindAddr, info.bindPort,
          c.remoteAddress, c.remotePort, function(err, channel){
            if(err) {
              //if the device is refusing lnks, maybe we should kill it ..
              debug("Revert fowarding as been declined", err);
              return;
            }
            channel.on("error", function(){ }); // like i care
            c.on("error", function(){ });       // same here

            channel.pipe(c);
            c.pipe(channel);

            client.once('end', function() {
              c.destroy();
            });
        });
        debug("Request forward", out);
      } catch(err) {
        c.end();
        debug("Failed to forward", err);
      }
    });
    
    client.localNetServer = server;
    try{
      var port = await this.fetch_port(client);
      debug("Fetched remote port ", port);
      client.details.localPort = port;
      accept();
      server.listen(port, function() {
        debug("Server forwarding lnk bound at %d ", port);
      });
      server.on('error', function(){
       client.end();
       //throw "Failed to listen to " + port;
      });
    }catch(err){
      reject();
    }  
  }
};

module.exports = SshHost; 
