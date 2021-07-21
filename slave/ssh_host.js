'use strict';

const net    = require('net');
const crypto = require('crypto');

const ssh2   = require('ssh2');
const utils  = ssh2.utils;
const debug       = require('debug')('mas4h:slave');
const defer   = require('nyks/promise/defer');



const {socketwrap, override}  = require('socketwrap');
const {EventEmitter} = require('events');

class SshHost {
  constructor({server_rsa, use_socketwrap}, new_client) {

    if(use_socketwrap) {

      this._server = new ssh2.Server({
        hostKeys : [server_rsa],
      }, new_client);
      this._server.on('error', (err) => debug('server error', err));

    } else {

      var proxy = new EventEmitter();

      this._server = new net.Server(async (socket) => {
        let {remoteAddress, remotePort} = await socketwrap(socket);
        override(socket, {remoteAddress, remotePort}); //you might want to deal with that in another way
        proxy.emit("connection", socket); //BOUM
      });

      this._ssh_server = new ssh2.Server({
        hostKeys : [server_rsa],
        server   : proxy,
      }, new_client);

      this._ssh_server.on('error', (err) => debug('server error', err));
    }

  }

  listen(port, addr) {



    return new Promise((resolve) => {
      this._server.listen(port, addr, function() {
        resolve(this.address().port);
      });
    });
  }


  check_authentication(client, validate) {
    var defered = defer();
    setTimeout(defered.reject, 5 * 1000, "Timeout");
    client.on('authentication', this._check_authentication.bind(null, validate, defered));
    return defered;
  }


  async prepare_forward_server(client) {
    var defered = defer();
    setTimeout(defered.reject, 5 * 1000, "Timeout");
    client.once('request', this._prepare_forward_server.bind(null, client, defered));
    return defered;
  }

  async _check_authentication(validate, defered, ctx) {

    if(!(ctx.method === 'publickey' && ctx.key.algo == "ssh-rsa"))
      return ctx.reject(['password', 'publickey'], true);

    var pem = utils.parseKey("ssh-rsa " + ctx.key.data.toString('base64')).getPublicPEM();
    await validate(ctx.key.data.toString('base64'));

    try {

      if(ctx.signature) {
        debug("Verify signature");
        var verifier = crypto.createVerify(ctx.sigAlgo);
        verifier.update(ctx.blob);
        if(verifier.verify(pem, ctx.signature, 'binary')) {
          ctx.accept();
          defered.resolve();
        } else {
          ctx.reject(['password', 'publickey'], true);
        }
      } else {
        // if no signature present, that means the client is just checking
        // the validity of the given public key
        ctx.accept();
      }
    } catch(err) {
      debug(err);
      return ctx.reject(['password', 'publickey'], true);
    }
  }

  _prepare_forward_server(client, defered, accept, reject, name, info) {
    if(name != "tcpip-forward")
      return reject();

    var server = net.createServer(function(c) {
      try {
        var out = client.forwardOut(
          info.bindAddr, info.bindPort,
          c.remoteAddress, c.remotePort, function(err, channel) {
            if(err) {
              //if the device is refusing lnks, maybe we should kill it ..
              debug("Revert fowarding as been declined", err);
              return;
            }
            channel.on("error", function() { }); // like i care
            c.on("error", function() { });       // same here

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


    server.listen(0, () => {
      debug("Server forwarding lnk bound at %d ", server.address().port);
      defered.resolve({port : server.address().port, ...info});
      accept();
    });

    server.once('error', () => {
      client.end();
    });

    client.once('end', () => {
      server.close();
    });

  }

}

module.exports = SshHost;
