'use strict';

const fs     = require('fs');
const util   = require('util');
const net    = require('net');
const crypto = require('crypto');

const ssh2   = require('ssh2');
const utils  = ssh2.utils;
const debug       = require('debug')('mas4h:slave');
const defer   = require('nyks/promise/defer');

class SshHost {
  constructor(server_rsa, new_client) {
    this.server = new ssh2.Server({hostKeys: [server_rsa]}, new_client);
  }

  listen(port, addr) {
    return new Promise((resolve) => {
      this.server.listen(port, addr, function(){
        resolve(this.address().port);
      });
    });
  }


  check_authentication(client, validate){
    var defered = defer();
    setTimeout(defered.reject, 2000, "Timeout");
    client.on('authentication', this._check_authentication.bind(null, validate, defered));
    return defered;
  }


  async prepare_forward_server(client) {
    var defered = defer();
    setTimeout(defered.reject, 2000, "Timeout");
    client.once('request', this._prepare_forward_server.bind(null, client, defered));
    return defered;
  }

  async _check_authentication(validate, defered, ctx) {

    if(!(ctx.method === 'publickey' && ctx.key.algo == "ssh-rsa"))
      return ctx.reject(['password', 'publickey'], true);

    var pem = utils.genPublicKey({public:ctx.key.data, type:'rsa'}).publicOrig;

    await validate(ctx.key.data.toString('base64'));

    try {
      if (ctx.signature) {
        debug("Verify signature");
        var verifier = crypto.createVerify(ctx.sigAlgo);
        verifier.update(ctx.blob);
        if (verifier.verify(pem, ctx.signature, 'binary')) {
          ctx.accept();
          defered.resolve();
        } else
          ctx.reject(['password', 'publickey'], true);
      } else {
        // if no signature present, that means the client is just checking
        // the validity of the given public key
        ctx.accept();
      }
    } catch(err) {
      debug(err)
      return ctx.reject(['password', 'publickey'], true);
    }
  }

   _prepare_forward_server(client, defered, accept, reject, name, info){
    if(name != "tcpip-forward")
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


    client.once('end', async () => {
      try {
        server.close();
      } catch(e) { }
    })

    server.listen(0, () => {
      debug("Server forwarding lnk bound at %d ", server.address().port);
      defered.resolve(server.address().port);
      accept();
    })
    
    server.on('error', function(){
      client.end();
    });
  }

};

module.exports = SshHost; 
