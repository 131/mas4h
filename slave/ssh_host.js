'use strict';

const fs     = require('fs');
const util   = require('util');
const net    = require('net');
const crypto = require('crypto');

const ssh2   = require('ssh2');
const utils  = ssh2.utils;
const debug       = require('debug')('mas4h:slave');
const defer = require('nyks/promise/defer')

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
    client.on('error', (err) => { debug("Client on error", err); });
    this.new_device(client);
  }

  async check_authentication(client, ctx) {
    client.username = ctx.username;
    if(!(ctx.method === 'publickey' && ctx.key.algo == "ssh-rsa"))
      return ctx.reject(['password', 'publickey'], true);
    var pem = utils.genPublicKey({public:ctx.key.data, type:'rsa'}).publicOrig;
    try{
      var validated_devices = await this.validate_device(ctx.key.data.toString('base64'));
      if(!validated_devices.client_key)
        throw 'no client_key';
      client.details          = Object.assign({client_key : validated_devices.client_key}, {validated_devices}) || {};
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
    if(client.details.port)
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

    try{      
      var port = await this.fetch_port(client);
      debug("Fetched remote port ", port);
      var defered = defer()
      server.listen(port, defered.resolve.bind(null))
      await defered;
      debug("Server forwarding lnk bound at %d ", port);
      accept();
    } catch (err){
      console.log(err);
      reject();
    }
    
    client.once('end', async () => {
      debug("Client %s disconnected, local binding was %s", client.details.client_key, client.details.port);
      try {
        await this.lost_device(client);
        server.close();
      } catch(e) { }
    })

    server.on('error', function(){
      client.end();
    });
  }

};

module.exports = SshHost; 
